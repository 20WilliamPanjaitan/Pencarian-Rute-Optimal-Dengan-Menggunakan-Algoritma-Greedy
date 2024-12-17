# app.py
from flask import Flask, jsonify, render_template, request
import requests
import random
from itertools import combinations
from operator import itemgetter
import time

app = Flask(__name__)

def geocode_location(location_name):
    """
    Mengkonversi nama lokasi menjadi koordinat menggunakan Nominatim API
    """
    base_url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': location_name,
        'format': 'json',
        'limit': 1
    }
    headers = {
        'User-Agent': 'OptimizedRouteApp/1.0'
    }
    
    try:
        response = requests.get(base_url, params=params, headers=headers)
        data = response.json()
        
        if data:
            return {
                'lat': float(data[0]['lat']),
                'lon': float(data[0]['lon']),
                'display_name': data[0]['display_name']
            }
        return None
    except Exception as e:
        print(f"Error in geocoding: {e}")
        return None

def get_cities_along_route(coords):
    """
    Mendapatkan nama kota yang dilalui berdasarkan koordinat
    """
    cities = []
    city_coords = {}
    
    # Ambil sampel koordinat dari rute (tidak semua titik untuk efisiensi)
    num_samples = min(5, len(coords)//2)  # Batasi sampai 5 titik
    step = len(coords) // (num_samples + 1)
    sampled_coords = coords[::step]
    
    for coord in sampled_coords:
        base_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            'lat': coord[1],
            'lon': coord[0],
            'format': 'json',
            'zoom': 10  # Level zoom untuk mendapatkan nama kota
        }
        headers = {
            'User-Agent': 'OptimizedRouteApp/1.0'
        }
        
        try:
            response = requests.get(base_url, params=params, headers=headers)
            data = response.json()
            
            if 'address' in data:
                # Coba dapatkan nama kota/kabupaten
                city = data['address'].get('city') or data['address'].get('town') or \
                       data['address'].get('county') or data['address'].get('state')
                
                if city and city not in cities:
                    cities.append(city)
                    city_coords[city] = {'lat': coord[1], 'lon': coord[0]}
            
            # Tambahkan delay kecil antara request untuk menghindari rate limiting
            time.sleep(1)
            
        except Exception as e:
            print(f"Error in reverse geocoding: {e}")
            continue
            
    return cities, city_coords

def get_intermediate_points(start_coords, end_coords, num_points=2):
    """
    Menghasilkan titik-titik intermediate antara start dan end point
    Mengurangi jumlah titik menjadi 2 untuk mengoptimalkan rute
    """
    points = []
    lat_diff = end_coords['lat'] - start_coords['lat']
    lon_diff = end_coords['lon'] - start_coords['lon']
    
    for i in range(1, num_points + 1):
        factor = i / (num_points + 1)
        lat = start_coords['lat'] + (lat_diff * factor)
        lon = start_coords['lon'] + (lon_diff * factor)
        # Mengurangi random offset untuk rute yang lebih optimal
        lat += random.uniform(-0.005, 0.005)
        lon += random.uniform(-0.005, 0.005)
        points.append({'lat': lat, 'lon': lon})
    
    return points

def calculate_route_score(route):
    """
    Menghitung skor rute berdasarkan jarak dan waktu tempuh
    Skor lebih rendah = rute lebih baik
    """
    # Normalisasi: jarak dalam km, waktu dalam menit
    distance_weight = 0.6  # Memberikan bobot 60% pada jarak
    time_weight = 0.4     # Memberikan bobot 40% pada waktu
    
    # Konversi ke km dan menit
    distance_km = route['distance'] / 1000
    duration_min = route['duration'] / 60
    
    # Hitung skor (semakin rendah semakin baik)
    score = (distance_km * distance_weight) + (duration_min * time_weight)
    return score

def get_route_with_waypoints(start_coords, end_coords, waypoints=None):
    """
    Mendapatkan rute dengan waypoint optional
    """
    coordinates = f"{start_coords['lon']},{start_coords['lat']}"
    
    if waypoints:
        for point in waypoints:
            coordinates += f";{point['lon']},{point['lat']}"
    
    coordinates += f";{end_coords['lon']},{end_coords['lat']}"
    
    osrm_url = f"http://router.project-osrm.org/route/v1/driving/{coordinates}?overview=full&geometries=geojson&alternatives=true"
    
    try:
        response = requests.get(osrm_url)
        return response.json()
    except:
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_route', methods=['GET'])
def get_route():
    start_location = request.args.get('start')
    end_location = request.args.get('end')
    
    if not start_location or not end_location:
        return jsonify(error="Lokasi awal dan tujuan harus diisi"), 400
    
    # Geocode kedua lokasi
    start_coords = geocode_location(start_location)
    end_coords = geocode_location(end_location)
    
    if not start_coords or not end_coords:
        return jsonify(error="Tidak dapat menemukan satu atau kedua lokasi"), 400
    
    all_routes = []
    used_distances = set()  # Untuk mencegah rute duplikat
    
    # 1. Mendapatkan rute langsung dengan alternatif
    direct_routes = get_route_with_waypoints(start_coords, end_coords)
    if direct_routes and 'routes' in direct_routes:
        for route in direct_routes['routes']:
            distance = round(route['distance'], 2)
            if distance not in used_distances:  # Cek duplikat
                coords = route['geometry']['coordinates']
                waypoint_cities, city_coords = get_cities_along_route(coords)
                
                route_info = {
                    'geometry': route['geometry'],
                    'distance': distance / 1000,  # Konversi ke kilometer
                    'duration': route['duration'] / 60,  # Konversi ke menit
                    'type': 'Rute Langsung',
                    'waypoint_cities': waypoint_cities,
                    'city_coords': city_coords
                }
                route_info['score'] = calculate_route_score(route)
                all_routes.append(route_info)
                used_distances.add(distance)
    
    # 2. Mendapatkan rute dengan waypoint intermediate
    intermediate_points = get_intermediate_points(start_coords, end_coords)
    
    # Hanya menggunakan 1 waypoint untuk optimasi
    for waypoint in intermediate_points:
        route_data = get_route_with_waypoints(start_coords, end_coords, [waypoint])
        if route_data and 'routes' in route_data:
            route = route_data['routes'][0]
            distance = round(route['distance'], 2)
            if distance not in used_distances:
                coords = route['geometry']['coordinates']
                waypoint_cities, city_coords = get_cities_along_route(coords)
                
                route_info = {
                    'geometry': route['geometry'],
                    'distance': distance / 1000,
                    'duration': route['duration'] / 60,
                    'type': 'Rute Alternatif',
                    'waypoint_cities': waypoint_cities,
                    'city_coords': city_coords
                }
                route_info['score'] = calculate_route_score(route)
                all_routes.append(route_info)
                used_distances.add(distance)
    
    # Urutkan rute berdasarkan skor dan ambil 5 rute terbaik
    best_routes = sorted(all_routes, key=lambda x: x['score'])[:5]
    
    # Tambahkan peringkat ke setiap rute
    for i, route in enumerate(best_routes, 1):
        route['rank'] = i
    
    return jsonify({
        'routes': best_routes,
        'start_location': {
            'name': start_coords['display_name'],
            'lat': start_coords['lat'],
            'lon': start_coords['lon']
        },
        'end_location': {
            'name': end_coords['display_name'],
            'lat': end_coords['lat'],
            'lon': end_coords['lon']
        }
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)