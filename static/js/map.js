document.addEventListener('DOMContentLoaded', function() {
    // Inisialisasi peta
    const map = L.map('map').setView([-2.548926, 118.014863], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let routeLayers = [];
    let markers = [];
    let activeRouteIndex = null;
    const routeColors = [
        '#1e88e5', // Biru
        '#43a047', // Hijau
        '#e53935', // Merah
        '#fb8c00', // Oranye
        '#8e24aa', // Ungu
        '#00acc1', // Cyan
        '#3949ab', // Indigo
        '#827717'  // Olive
    ];

    function createLegendControl() {
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'legend');
            div.style.backgroundColor = 'white';
            div.style.padding = '10px';
            div.style.borderRadius = '5px';
            div.style.border = '1px solid #ccc';
            return div;
        };
        return legend;
    }

    const legend = createLegendControl();

    function showAllRoutes() {
        routeLayers.forEach(layer => {
            layer.setStyle({ opacity: 0.7 });
            if (!map.hasLayer(layer)) {
                map.addLayer(layer);
            }
        });
        activeRouteIndex = null;
        updateRouteOptionsHighlight();
    }

    function showSingleRoute(index) {
        routeLayers.forEach((layer, idx) => {
            if (idx === index) {
                layer.setStyle({ opacity: 1 });
                if (!map.hasLayer(layer)) {
                    map.addLayer(layer);
                }
            } else {
                map.removeLayer(layer);
            }
        });
        activeRouteIndex = index;
        updateRouteOptionsHighlight();
    }

    function updateRouteOptionsHighlight() {
        const routeOptions = document.querySelectorAll('.route-option');
        routeOptions.forEach((option, idx) => {
            if (idx === activeRouteIndex) {
                option.classList.add('active-route');
            } else {
                option.classList.remove('active-route');
            }
        });
    }

    // Event listener untuk form submission
    document.getElementById('submit-locations').addEventListener('click', function() {
        const startLocation = document.getElementById('start-location').value;
        const endLocation = document.getElementById('end-location').value;

        if (!startLocation || !endLocation) {
            alert('Silakan masukkan lokasi awal dan tujuan');
            return;
        }

        // Hapus rute dan marker sebelumnya
        routeLayers.forEach(layer => map.removeLayer(layer));
        routeLayers = [];
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        map.removeControl(legend);
        activeRouteIndex = null;

        // Tampilkan loading state
        document.getElementById('locations').textContent = 'Mencari rute...';
        document.getElementById('route-details').innerHTML = 'Menghitung rute...';

        // Kirim request ke backend
        fetch(`/get_route?start=${encodeURIComponent(startLocation)}&end=${encodeURIComponent(endLocation)}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }

                // Tambahkan marker untuk lokasi awal dan akhir
                const startMarker = L.marker([data.start_location.lat, data.start_location.lon])
                    .bindPopup(data.start_location.name)
                    .addTo(map);
                const endMarker = L.marker([data.end_location.lat, data.end_location.lon])
                    .bindPopup(data.end_location.name)
                    .addTo(map);
                markers.push(startMarker, endMarker);

                // Tampilkan semua rute alternatif
                let routeDetailsHTML = `
                    <div class="routes-header">
                        <h3>Rute yang Tersedia:</h3>
                        <button id="show-all-routes" class="btn-secondary">Tampilkan Semua Rute</button>
                    </div>
                `;
                let legendContent = '<h4 style="margin: 0 0 8px 0">Legend</h4>';

                data.routes.forEach((route, index) => {
                    const routeLayer = L.geoJSON(route.geometry, {
                        style: {
                            color: routeColors[index % routeColors.length],
                            weight: 4,
                            opacity: 0.7
                        }
                    }).addTo(map);

                    routeLayer.bindPopup(`
                        <strong>Rute ${index + 1}</strong><br>
                        Tipe: ${route.type}<br>
                        Jarak: ${route.distance.toFixed(2)} km<br>
                        Waktu: ${route.duration.toFixed(0)} menit
                    `);
                    routeLayers.push(routeLayer);

                    const routeColor = routeColors[index % routeColors.length];
                    routeDetailsHTML += `
                        <div class="route-option" 
                             data-route-index="${index}"
                             style="border-left: 4px solid ${routeColor}; padding-left: 10px; margin: 10px 0;"
                             onmouseover="this.style.backgroundColor='#f0f0f0'"
                             onmouseout="this.style.backgroundColor='${activeRouteIndex === index ? '#e0e0e0' : '#f5f5f5'}'">
                            <strong>Rute ${index + 1} (${route.type})</strong><br>
                            Jarak: ${route.distance.toFixed(2)} km<br>
                            Waktu: ${route.duration.toFixed(0)} menit<br>
                            Kota yang Dilalui: ${route.waypoint_cities ? route.waypoint_cities.join(', ') : 'Tidak ada'}
                        </div>
                    `;

                    legendContent += `
                        <div style="margin-bottom: 5px">
                            <span style="display: inline-block; width: 20px; height: 3px; background-color: ${routeColor}; margin-right: 5px"></span>
                            Rute ${index + 1}
                        </div>
                    `;

                    // Tambahkan marker untuk kota yang dilalui
                    const cityMarkerGroup = L.layerGroup();
                    if (route.waypoint_cities && route.waypoint_cities.length > 0) {
                        route.waypoint_cities.forEach(city => {
                            const cityCoords = route.city_coords[city];
                            if (cityCoords) {
                                const cityMarker = L.marker([cityCoords.lat, cityCoords.lon], {
                                    icon: L.divIcon({
                                      className: 'city-waypoint-marker',
                                      html: `<div style="background-color: white; 
                                                        border: 2px solid ${routeColors[index % routeColors.length]}; 
                                                        border-radius: 50%;
                                                        width: 12px;
                                                        height: 12px;
                                                        display: flex;
                                                        align-items: center;
                                                        justify-content: center;">
                                              <span style="font-size: 8px; color: black;">${city}</span>
                                            </div>`,
                                      iconSize: [40, 16],
                                      iconAnchor: [20, 8]
                                    })
                                  }).addTo(cityMarkerGroup);
                                
                                cityMarker.bindPopup(`<strong>${city}</strong>`);
                                markers.push(cityMarker);
                            }
                        });
                    }
                    cityMarkerGroup.addTo(map);
                });

                // Update informasi rute
                document.getElementById('locations').innerHTML = 
                    `<strong>Dari:</strong> ${data.start_location.name}<br><strong>Ke:</strong> ${data.end_location.name}`;
                document.getElementById('route-details').innerHTML = routeDetailsHTML;

                // Add event listeners for route selection
                document.querySelectorAll('.route-option').forEach(option => {
                    option.addEventListener('click', function() {
                        const routeIndex = parseInt(this.getAttribute('data-route-index'));
                        if (activeRouteIndex === routeIndex) {
                            showAllRoutes();
                        } else {
                            showSingleRoute(routeIndex);
                        }
                        document.querySelector('#map').scrollIntoView({behavior: 'smooth'});
                    });
                });

                // Add event listener for show all routes button
                document.getElementById('show-all-routes').addEventListener('click', showAllRoutes);

                // Update legend
                legend.onAdd = function() {
                    const div = L.DomUtil.create('div', 'legend');
                    div.style.backgroundColor = 'white';
                    div.style.padding = '10px';
                    div.style.borderRadius = '5px';
                    div.style.border = '1px solid #ccc';
                    div.innerHTML = legendContent;
                    return div;
                };
                legend.addTo(map);

                // Fit bounds untuk menampilkan semua rute
                if (routeLayers.length > 0) {
                    const bounds = L.featureGroup(routeLayers).getBounds();
                    map.fitBounds(bounds);
                }
            })
            .catch(error => {
                alert(error.message || 'Terjadi kesalahan saat mengambil rute');
                // Reset informasi rute jika terjadi error
                document.getElementById('locations').textContent = 'Dari: - \nKe: -';
                document.getElementById('route-details').innerHTML = '';
            });
    });
});