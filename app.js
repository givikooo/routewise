const initialStops = [
  { name: 'Red Hill, Pennsylvania 18076', lat: 40.3723, lng: -75.4807, delayMinutes: 0 },
  { name: 'Philadelphia, Pennsylvania', lat: 39.9526, lng: -75.1652, delayMinutes: 0 },
  { name: 'New York, New York', lat: 40.7128, lng: -74.0060, delayMinutes: 0 }
];
let stops = [...initialStops], profile = 'DRIVING', vehicleProfile = 'truck', map, Route, markers = [], lastLegs = [], trafficPolylines = [];
const stopsEl = document.getElementById('stops'), legsEl = document.getElementById('legs'), statusEl = document.getElementById('status'), apiKey = window.ROUTEWISE_GOOGLE_MAPS_API_KEY;
const fmtDistance = meters => meters >= 1000 ? `${(meters / 1000).toFixed(meters > 10000 ? 0 : 1)} კმ` : `${Math.round(meters)} მ`;
const fmtTime = seconds => { const mins = Math.round(seconds / 60); return mins >= 60 ? `${Math.floor(mins / 60)} სთ ${mins % 60} წთ` : `${mins} წთ`; };
const setStatus = text => statusEl.textContent = text;
const legDistance = leg => leg.distanceMeters ?? leg.distance?.value ?? 0;
const legDuration = leg => leg.durationMillis != null ? leg.durationMillis / 1000 : (leg.duration_in_traffic?.value || leg.duration?.value || 0);
const vehicleProfiles = {
  truck: { label: 'Truck', maxSpeedKph: 80 },
  'heavy-b': { label: 'მძიმე B', maxSpeedKph: 90 }
};
const cappedDuration = leg => {
  const routeSeconds = legDuration(leg), capSeconds = legDistance(leg) / (vehicleProfiles[vehicleProfile].maxSpeedKph / 3.6);
  return Math.max(routeSeconds, capSeconds);
};
function renderVehicleNote() {
  const vehicle = vehicleProfiles[vehicleProfile];
  document.getElementById('vehicleNote').textContent = `${vehicle.label} · მაქს. ${vehicle.maxSpeedKph} კმ/სთ`;
}

const usageLimits = { maps: 10000, places: 10000, directions: 5000 };
function getUsage() {
  const month = new Date().toISOString().slice(0, 7), saved = JSON.parse(localStorage.getItem('routewise-usage') || '{}');
  return saved.month === month ? saved : { month, maps: 0, places: 0, directions: 0 };
}
function renderUsage() {
  const usage = getUsage(), labels = { maps: 'რუკა', places: 'ძებნა', directions: 'მარშრუტი' };
  document.getElementById('usageMetrics').innerHTML = Object.keys(usageLimits).map(type => {
    const used = usage[type] || 0, limit = usageLimits[type], remaining = Math.max(0, Math.round((1 - used / limit) * 100));
    return `<div class="usage-row"><span>${labels[type]}</span><b>${used.toLocaleString()} / ${limit.toLocaleString()}</b><div class="usage-track"><i style="width:${Math.min(100, used / limit * 100)}%"></i></div><small>${remaining}% დარჩა</small></div>`;
  }).join('');
}
function recordUsage(type) { const usage = getUsage(); usage[type] = (usage[type] || 0) + 1; localStorage.setItem('routewise-usage', JSON.stringify(usage)); renderUsage(); }
function parseCoordinates(value) {
  const match = value.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng } : null;
}
function clearTrafficRoute() { trafficPolylines.forEach(line => line.setMap(null)); trafficPolylines = []; }
function renderTrafficRoute(route) {
  clearTrafficRoute();
  const driving = profile === 'DRIVING';
  document.getElementById('trafficLegend').classList.toggle('visible', driving);
  if (!driving) return;
  trafficPolylines = route.createPolylines({
    polylineOptions: (defaults, details) => ({
      ...defaults,
      strokeColor: details.speed === 'TRAFFIC_JAM' ? '#d93025' : details.speed === 'SLOW' ? '#fbbc04' : '#1e8e5a',
      strokeOpacity: .95,
      strokeWeight: 7,
      zIndex: 10
    })
  });
  trafficPolylines.forEach(line => line.setMap(map));
}
function renderRouteMetrics() {
  if (!lastLegs.length) return;
  const routeSeconds = lastLegs.reduce((sum, leg) => sum + cappedDuration(leg), 0);
  const distance = lastLegs.reduce((sum, leg) => sum + legDistance(leg), 0);
  const delaySeconds = stops.slice(1).reduce((sum, stop) => sum + (Number(stop.delayMinutes) || 0) * 60, 0);
  document.getElementById('totalDistance').textContent = fmtDistance(distance);
  document.getElementById('totalDuration').textContent = fmtTime(routeSeconds + delaySeconds);
  legsEl.innerHTML = lastLegs.map((leg, index) => {
    const delay = Number(stops[index + 1].delayMinutes) || 0;
    return `<div class="leg"><span class="leg-number">${index + 1}</span><div class="leg-route"><b>${stops[index].name}</b>→ ${stops[index + 1].name}${delay ? `<small class="delay-note">შეყოვნება: ${delay} წთ</small>` : ''}</div><div class="leg-stats">${fmtDistance(legDistance(leg))}<small>${fmtTime(cappedDuration(leg))}${delay ? ` + ${delay} წთ` : ''}</small></div></div>`;
  }).join('');
  document.getElementById('routeBadge').textContent = `${lastLegs.length} მონაკვეთი · ≤${vehicleProfiles[vehicleProfile].maxSpeedKph} კმ/სთ${delaySeconds ? ` + ${Math.round(delaySeconds / 60)} წთ` : ''}`;
}
function renderStops() {
  stopsEl.innerHTML = '';
  stops.forEach((stop, index) => {
    const node = document.getElementById('stopTemplate').content.cloneNode(true), input = node.querySelector('input');
    node.querySelector('.stop-index').textContent = index + 1; input.value = stop.name || '';
    input.addEventListener('change', () => chooseInput(input.value, index));
    input.addEventListener('input', () => { clearTimeout(input.usageTimer); if (input.value.trim().length >= 2) input.usageTimer = setTimeout(() => recordUsage('places'), 500); });
    node.querySelector('.remove-stop').onclick = () => { if (stops.length > 2) { stops.splice(index, 1); renderStops(); renderMarkers(); calculate(); } };
    stopsEl.append(node); attachAutocomplete(input, index);
    if (index > 0) {
      const delayRow = document.createElement('div'); delayRow.className = 'delay-row';
      delayRow.innerHTML = `<span>შეყოვნება პუნქტზე ${index + 1}</span><input type="number" min="0" step="1" value="${stop.delayMinutes || ''}" placeholder="0" /><small>წუთი</small>`;
      const delayInput = delayRow.querySelector('input');
      delayInput.addEventListener('input', () => { stops[index].delayMinutes = Math.max(0, Number(delayInput.value) || 0); renderRouteMetrics(); });
      stopsEl.append(delayRow);
    }
  });
  document.getElementById('stopCount').textContent = `${stops.length} წერტილი`;
}
function attachAutocomplete(input, index) {
  const autocomplete = new google.maps.places.Autocomplete(input, { componentRestrictions: { country: 'us' }, fields: ['formatted_address', 'geometry', 'name'] });
  autocomplete.addListener('place_changed', () => { const place = autocomplete.getPlace(); if (!place.geometry?.location) return setStatus('ადგილი ვერ მოიძებნა — სცადე უფრო სრული მისამართი.'); applyPlace({ name: place.formatted_address || place.name, lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }, index); });
}
function chooseInput(value, index) { const coordinates = parseCoordinates(value); if (coordinates) return applyPlace(coordinates, index); geocodeStop(value, index); }
function applyPlace(place, index) { stops[index] = { ...place, delayMinutes: stops[index]?.delayMinutes || 0 }; renderStops(); renderMarkers(); map.panTo({ lat: place.lat, lng: place.lng }); calculate(); }
function renderMarkers() {
  markers.forEach(marker => marker.setMap(null)); markers = []; if (!map) return;
  stops.forEach((stop, index) => { if (stop.lat == null) return; markers.push(new google.maps.Marker({ map, position: { lat: stop.lat, lng: stop.lng }, label: { text: String(index + 1), color: '#fff', fontWeight: '700' }, icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: index === stops.length - 1 ? '#e35a46' : '#176e50', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 15 } })); });
}
async function geocodeStop(query, index) {
  if (!query.trim()) return; setStatus('ვეძებთ ადგილს…');
  try { const { results } = await new google.maps.Geocoder().geocode({ address: query, componentRestrictions: { country: 'US' } }); if (!results[0]) throw Error(); const location = results[0].geometry.location; applyPlace({ name: results[0].formatted_address, lat: location.lat(), lng: location.lng() }, index); } catch { setStatus('ადგილი ვერ მოიძებნა — სცადე აშშ-ის უფრო სრული მისამართი.'); }
}
async function calculate() {
  if (!Route || stops.some(stop => stop.lat == null)) return;
  recordUsage('directions'); setStatus('Google Routes ითვლის მარშრუტს და ცოცხალ ტრეფიკს…');
  const driving = profile === 'DRIVING';
  const request = {
    origin: { lat: stops[0].lat, lng: stops[0].lng },
    destination: { lat: stops.at(-1).lat, lng: stops.at(-1).lng },
    intermediates: stops.slice(1, -1).map(stop => ({ location: { lat: stop.lat, lng: stop.lng } })),
    travelMode: profile,
    units: google.maps.UnitSystem.METRIC,
    fields: driving
      ? ['path', 'speedPaths', 'routeLabels', 'distanceMeters', 'durationMillis', 'staticDurationMillis', 'legs']
      : ['path', 'distanceMeters', 'durationMillis', 'legs']
  };
  if (driving) Object.assign(request, { routingPreference: 'TRAFFIC_AWARE_OPTIMAL', extraComputations: ['TRAFFIC_ON_POLYLINE'] });
  try {
    const { routes } = await Route.computeRoutes(request), route = routes?.[0];
    if (!route) throw Error('NO_ROUTE');
    lastLegs = route.legs || [];
    renderTrafficRoute(route);
    if (!driving) {
      clearTrafficRoute();
      trafficPolylines = route.createPolylines({ polylineOptions: { strokeColor: '#6948e7', strokeOpacity: .92, strokeWeight: 7, zIndex: 10 } });
      trafficPolylines.forEach(line => line.setMap(map));
    }
    renderRouteMetrics();
    if (route.viewport) map.fitBounds(route.viewport, 56);
    setStatus(driving ? 'მარშრუტი მზადაა — ფერები წარმოადგენს არჩეული გზის ცოცხალ ტრეფიკს.' : 'მარშრუტი მზად არის.');
  } catch (error) {
    console.error(error); const reason = error?.message || String(error); setStatus('Routes API შეცდომა: ' + reason);
  }
}
window.initMap = function initMap() {
  recordUsage('maps');
  map = new google.maps.Map(document.getElementById('map'), { center: { lat: 40.35, lng: -75.45 }, zoom: 9, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: true });
  map.addListener('click', event => { const index = stops.findIndex(stop => stop.lat == null); if (index < 0) return setStatus('ჯერ დაამატე ცარიელი გაჩერება, შემდეგ მონიშნე წერტილი რუკაზე.'); applyPlace({ name: `მონიშნული წერტილი ${index + 1}`, lat: event.latLng.lat(), lng: event.latLng.lng() }, index); });
  renderStops(); renderMarkers();
  google.maps.importLibrary('routes').then(library => { Route = library.Route; calculate(); }).catch(() => setStatus('Routes Library ვერ ჩაიტვირთა — შეამოწმე Routes API.'));
};
document.getElementById('addStop').onclick = () => { stops.push({ name: '', lat: null, lng: null, delayMinutes: 0 }); renderStops(); };
document.getElementById('buildRoute').onclick = calculate;
document.querySelectorAll('.mode').forEach(button => button.onclick = () => { document.querySelector('.mode.active').classList.remove('active'); button.classList.add('active'); vehicleProfile = button.dataset.profile; renderVehicleNote(); if (lastLegs.length) { renderRouteMetrics(); setStatus('არჩეულია ' + vehicleProfiles[vehicleProfile].label + ' — დრო შეზღუდულია ' + vehicleProfiles[vehicleProfile].maxSpeedKph + ' კმ/სთ-ით.'); } else calculate(); });
document.getElementById('locate').onclick = () => { if (!navigator.geolocation) return setStatus('ბრაუზერი მდებარეობას არ უჭერს მხარს.'); navigator.geolocation.getCurrentPosition(({ coords }) => map.panTo({ lat: coords.latitude, lng: coords.longitude }), () => setStatus('მდებარეობის წაკითხვა ვერ მოხერხდა.')); };
renderUsage(); renderVehicleNote();
if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') setStatus('Google Maps-ის ჩასართავად მიუთითე API key ფაილში maps-config.js.'); else { const script = document.createElement('script'); script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly&callback=initMap`; script.async = true; script.defer = true; script.onerror = () => setStatus('Google Maps ვერ ჩაიტვირთა — შეამოწმე API key.'); document.head.append(script); }
