const initialStops = [
  { name: 'Red Hill, Pennsylvania 18076', lat: 40.3723, lng: -75.4807, delayMinutes: 0 },
  { name: 'Philadelphia, Pennsylvania', lat: 39.9526, lng: -75.1652, delayMinutes: 0 },
  { name: 'New York, New York', lat: 40.7128, lng: -74.006, delayMinutes: 0 }
];

const apiKey = window.ROUTEWISE_TOMTOM_API_KEY;
const stopsEl = document.getElementById('stops');
const legsEl = document.getElementById('legs');
const statusEl = document.getElementById('status');
const usageLimits = { maps: 200000, search: 10000, routing: 20000 };
const usageLabels = { maps: 'რუკა', search: 'ძიება', routing: 'მარშრუტი' };
const DEFAULT_TRUCK = {
  id: 'default', name: 'საბაზისო Truck', maxSpeedKph: 80,
  weightKg: 0, axleWeightKg: 0, axles: 0, lengthM: 0, widthM: 0, heightM: 0,
  travelMode: 'truck'
};
const vehicleProfiles = {
  'heavy-b': { label: 'მძიმე B', maxSpeedKph: 90, travelMode: 'car' }
};

let stops = initialStops.map(stop => ({ ...stop }));
let vehicleProfile = 'truck';
let truckProfiles = loadTruckProfiles();
let activeTruckId = localStorage.getItem('routewise-active-truck') || 'default';let map;
let markers = [];
let routeLines = [];
let lastLegs = [];
let calculateTimer;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const fmtDistance = meters => { const miles = Number(meters || 0) / 1609.344; return `${miles.toFixed(miles >= 100 ? 0 : 1)} mi`; };
const kphToMph = value => Number(value || 0) * 0.621371;
const mphToKph = value => Number(value || 0) / 0.621371;
const kgToLb = value => Number(value || 0) * 2.20462262;
const lbToKg = value => Number(value || 0) / 2.20462262;
const metersToFeet = value => Number(value || 0) * 3.28084;
const feetToMeters = value => Number(value || 0) / 3.28084;
const fmtTime = seconds => {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} სთ ${minutes % 60} წთ` : `${minutes} წთ`;
};
const setStatus = message => { statusEl.textContent = message; };
function numberOrZero(value) { return Math.max(0, Number(value) || 0); }
function loadTruckProfiles() {
  try { const value = JSON.parse(localStorage.getItem('routewise-truck-profiles') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveTruckProfiles() { localStorage.setItem('routewise-truck-profiles', JSON.stringify(truckProfiles)); localStorage.setItem('routewise-active-truck', activeTruckId); }
function activeTruck() { return truckProfiles.find(truck => truck.id === activeTruckId) || DEFAULT_TRUCK; }
function activeVehicle() { return vehicleProfile === 'truck' ? activeTruck() : vehicleProfiles[vehicleProfile]; }
function truckSummary(truck) {
  const details = [];
  if (truck.weightKg) details.push(`${Math.round(kgToLb(truck.weightKg)).toLocaleString()} lb`);
  if (truck.lengthM && truck.heightM) details.push(`${metersToFeet(truck.lengthM).toFixed(1)} x ${metersToFeet(truck.heightM).toFixed(1)} ft`);
  return details.join(' / ') || `Max. ${Math.round(kphToMph(truck.maxSpeedKph))} mph`;
}
const routeDuration = summary => Math.max(Number(summary?.travelTimeInSeconds) || 0, (Number(summary?.lengthInMeters) || 0) / (activeVehicle().maxSpeedKph / 3.6));

function getUsage() {
  const month = new Date().toISOString().slice(0, 7);
  const saved = JSON.parse(localStorage.getItem('routewise-tomtom-usage') || '{}');
  return saved.month === month ? saved : { month, maps: 0, search: 0, routing: 0 };
}

function renderUsage() {
  const usage = getUsage();
  document.getElementById('usageMetrics').innerHTML = Object.entries(usageLimits).map(([type, limit]) => {
    const used = usage[type] || 0;
    const remaining = Math.max(0, Math.round((1 - used / limit) * 100));
    return `<div class="usage-row"><span>${usageLabels[type]}</span><b>${used.toLocaleString()} / ${limit.toLocaleString()}</b><div class="usage-track"><i style="width:${Math.min(100, used / limit * 100)}%"></i></div><small>${remaining}% დარჩა</small></div>`;
  }).join('');
}

function recordUsage(type) {
  const usage = getUsage();
  usage[type] = (usage[type] || 0) + 1;
  localStorage.setItem('routewise-tomtom-usage', JSON.stringify(usage));
  renderUsage();
}

function parseCoordinates(value) {
  const match = value.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { name: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng }
    : null;
}

function renderVehicleNote() {
  const vehicle = activeVehicle();
  document.getElementById('vehicleNote').textContent = vehicleProfile === 'truck'
    ? `TomTom Truck routing - ${vehicle.name} - max. ${Math.round(kphToMph(vehicle.maxSpeedKph))} mph`
    : `${vehicle.label} - max. ${Math.round(kphToMph(vehicle.maxSpeedKph))} mph`;
}
function renderTruckControls() {}
function renderTruckLibrary() {
  const list = document.getElementById('truckList');
  const empty = document.getElementById('truckEmptyState');
  empty.hidden = truckProfiles.length > 0;
  list.innerHTML = truckProfiles.map(profile => `<div class="truck-list-row ${profile.id === activeTruckId ? 'active' : ''}"><button class="truck-list-main" type="button" data-use-truck="${escapeHtml(profile.id)}"><b>${escapeHtml(profile.name)}</b><small>${escapeHtml(truckSummary(profile))}${profile.id === activeTruckId ? ' - Active' : ''}</small></button><div class="truck-list-actions"><button type="button" data-edit-truck="${escapeHtml(profile.id)}">Edit</button><button type="button" data-delete-truck="${escapeHtml(profile.id)}">Delete</button></div></div>`).join('');
  document.querySelectorAll('[data-use-truck]').forEach(button => { button.onclick = () => selectTruck(button.dataset.useTruck); });
  document.querySelectorAll('[data-edit-truck]').forEach(button => { button.onclick = () => showTruckEditor(truckProfiles.find(truck => truck.id === button.dataset.editTruck)); });
  document.querySelectorAll('[data-delete-truck]').forEach(button => { button.onclick = () => deleteTruck(button.dataset.deleteTruck); });
}
function fillTruckForm(truck = null) {
  const form = document.getElementById('truckForm');
  const source = truck || DEFAULT_TRUCK;
  form.dataset.editId = truck?.id || '';
  form.elements.name.value = truck?.name || '';
  form.elements.maxSpeedMph.value = Math.max(1, Math.round(kphToMph(source.maxSpeedKph || 80)));
  form.elements.weightLb.value = truck?.weightKg ? Math.round(kgToLb(truck.weightKg)) : '';
  form.elements.axleWeightLb.value = truck?.axleWeightKg ? Math.round(kgToLb(truck.axleWeightKg)) : '';
  form.elements.axles.value = truck?.axles || '';
  form.elements.lengthFt.value = truck?.lengthM ? metersToFeet(truck.lengthM).toFixed(1) : '';
  form.elements.widthFt.value = truck?.widthM ? metersToFeet(truck.widthM).toFixed(1) : '';
  form.elements.heightFt.value = truck?.heightM ? metersToFeet(truck.heightM).toFixed(1) : '';
}
function showTruckLibrary() {
  document.getElementById('truckEditorView').hidden = true;
  document.getElementById('truckLibraryView').hidden = false;
  renderTruckLibrary();
}
function showTruckEditor(truck = null) {
  document.getElementById('truckLibraryView').hidden = true;
  document.getElementById('truckEditorView').hidden = false;
  fillTruckForm(truck);
  setTimeout(() => document.querySelector('#truckForm input[name="name"]')?.focus(), 50);
}
function openNewTruckForm() { showTruckEditor(); }
function openTruckModal() {
  const modal = document.getElementById('truckModal');
  modal.hidden = false; modal.setAttribute('aria-hidden', 'false');
  showTruckLibrary();
}
function closeTruckModal() { const modal = document.getElementById('truckModal'); modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); }
function saveTruckProfile(event) {
  event.preventDefault(); const form = event.currentTarget;
  const profile = {
    id: form.dataset.editId || (crypto.randomUUID ? crypto.randomUUID() : `truck-${Date.now()}`), name: form.elements.name.value.trim(),
    maxSpeedKph: Math.min(250, Math.max(1, mphToKph(numberOrZero(form.elements.maxSpeedMph.value) || 50))),
    weightKg: lbToKg(numberOrZero(form.elements.weightLb.value)), axleWeightKg: lbToKg(numberOrZero(form.elements.axleWeightLb.value)), axles: numberOrZero(form.elements.axles.value),
    lengthM: feetToMeters(numberOrZero(form.elements.lengthFt.value)), widthM: feetToMeters(numberOrZero(form.elements.widthFt.value)), heightM: feetToMeters(numberOrZero(form.elements.heightFt.value)), travelMode: 'truck'
  };
  if (!profile.name) return;
  const currentIndex = truckProfiles.findIndex(truck => truck.id === profile.id);
  if (currentIndex >= 0) truckProfiles[currentIndex] = profile; else truckProfiles.push(profile);
  activeTruckId = profile.id; vehicleProfile = 'truck';
  document.querySelector('.mode.active')?.classList.remove('active'); document.querySelector('[data-profile="truck"]')?.classList.add('active');
  saveTruckProfiles(); renderVehicleNote(); calculate(); showTruckLibrary();
}
function selectTruck(id) {
  activeTruckId = id; vehicleProfile = 'truck'; saveTruckProfiles(); renderVehicleNote(); calculate(); closeTruckModal();
}
function deleteTruck(id) {
  truckProfiles = truckProfiles.filter(truck => truck.id !== id);
  if (activeTruckId === id) activeTruckId = 'default';
  saveTruckProfiles(); renderVehicleNote(); calculate(); renderTruckLibrary();
}

function clearRoute() {
  routeLines.forEach(line => line.remove());
  routeLines = [];
}

function makeMarker(index) {
  return L.divIcon({
    className: '',
    html: `<div class="geo-marker ${index === stops.length - 1 ? 'destination' : ''}">${index + 1}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function renderMarkers() {
  markers.forEach(marker => marker.remove());
  markers = [];
  if (!map) return;
  stops.forEach((stop, index) => {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
    markers.push(L.marker([stop.lat, stop.lng], { icon: makeMarker(index), title: stop.name }).addTo(map));
  });
}

function renderStops() {
  stopsEl.innerHTML = '';
  stops.forEach((stop, index) => {
    const fragment = document.getElementById('stopTemplate').content.cloneNode(true);
    const input = fragment.querySelector('.stop-input');
    const suggestions = fragment.querySelector('.suggestions');
    input.value = stop.name || '';
    fragment.querySelector('.stop-index').textContent = index + 1;
    fragment.querySelector('.remove-stop').onclick = () => {
      if (stops.length <= 2) return;
      stops.splice(index, 1);
      renderStops();
      renderMarkers();
      calculate();
    };
    attachSuggestions(input, suggestions, index);
    stopsEl.append(fragment);

    if (index > 0) {
      const delayRow = document.createElement('div');
      delayRow.className = 'delay-row';
      delayRow.innerHTML = `<span>შეყოვნება პუნქტზე ${index + 1}</span><input type="number" min="0" step="1" value="${stop.delayMinutes || ''}" placeholder="0" /><small>წუთი</small>`;
      const delayInput = delayRow.querySelector('input');
      delayInput.addEventListener('input', () => {
        stops[index].delayMinutes = Math.max(0, Number(delayInput.value) || 0);
        renderRouteMetrics();
      });
      stopsEl.append(delayRow);
    }
  });
  document.getElementById('stopCount').textContent = `${stops.length} წერტილი`;
}

function attachSuggestions(input, container, index) {
  let timer;
  let results = [];
  const hide = () => setTimeout(() => container.classList.remove('visible'), 180);
  const choose = place => {
    container.classList.remove('visible');
    applyPlace(place, index);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const coordinate = parseCoordinates(input.value);
    if (coordinate) {
      results = [coordinate];
      showSuggestions(container, results, choose, true);
      return;
    }
    if (input.value.trim().length < 2) {
      container.classList.remove('visible');
      return;
    }
    timer = setTimeout(async () => {
      try {
        results = await searchPlaces(input.value);
        showSuggestions(container, results, choose);
      } catch (error) {
        console.error(error);
        container.classList.remove('visible');
      }
    }, 320);
  });
  input.addEventListener('change', () => chooseInput(input.value, index));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results[0]) choose(results[0]); else chooseInput(input.value, index);
    }
    if (event.key === 'Escape') container.classList.remove('visible');
  });
  input.addEventListener('blur', hide);
  input.addEventListener('focus', () => { if (results.length) container.classList.add('visible'); });
}

function showSuggestions(container, results, choose, coordinates = false) {
  if (!results.length) {
    container.innerHTML = '<div class="suggestion-empty">ადგილი ვერ მოიძებნა.</div>';
  } else {
    container.innerHTML = results.map((place, index) => `<button type="button" class="suggestion-item ${coordinates ? 'coordinate-item' : ''}" data-index="${index}"><span class="suggestion-pin">⌖</span><span><b>${escapeHtml(place.name)}</b>${coordinates ? '<small>კოორდინატების გამოყენება</small>' : `<small>${escapeHtml(place.address || 'USA')}</small>`}</span></button>`).join('');
    container.querySelectorAll('.suggestion-item').forEach(button => {
      button.addEventListener('mousedown', event => { event.preventDefault(); choose(results[Number(button.dataset.index)]); });
    });
  }
  container.classList.add('visible');
}

async function searchPlaces(query) {
  if (!apiKey) return [];
  const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`;
  const params = new URLSearchParams({ key: apiKey, countrySet: 'US', typeahead: 'true', limit: '6', language: 'en-US', maxFuzzyLevel: '3' });
  const response = await fetch(`${endpoint}?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.detailedError?.message || data?.error?.description || 'Search request failed');
  recordUsage('search');
  return (data.results || []).filter(result => result.position).map(result => ({
    name: result.address?.freeformAddress || result.poi?.name || result.address?.municipality || query,
    address: [result.poi?.name, result.address?.countrySubdivision, result.address?.country].filter(Boolean).join(', '),
    lat: result.position.lat,
    lng: result.position.lon
  }));
}

async function chooseInput(value, index) {
  const coordinate = parseCoordinates(value);
  if (coordinate) return applyPlace(coordinate, index);
  if (!value.trim()) return;
  setStatus('TomTom-ით ვეძებთ ადგილს…');
  try {
    const results = await searchPlaces(value);
    if (!results[0]) throw new Error('ადგილი ვერ მოიძებნა');
    applyPlace(results[0], index);
  } catch (error) {
    console.error(error);
    setStatus('ადგილი ვერ მოიძებნა — სცადე უფრო სრული აშშ-ის მისამართი ან კოორდინატები.');
  }
}

function applyPlace(place, index) {
  stops[index] = { ...place, delayMinutes: stops[index]?.delayMinutes || 0 };
  renderStops();
  renderMarkers();
  if (map) map.panTo([place.lat, place.lng]);
  calculate();
}

function flattenRoutePoints(route) {
  return (route.legs || []).flatMap((leg, index) => (leg.points || []).slice(index ? 1 : 0)).map(point => [point.latitude, point.longitude]);
}

function trafficColor(section) {
  if (section.simpleCategory === 'JAM' || section.magnitudeOfDelay >= 3) return '#d93025';
  if (section.simpleCategory === 'SLOW' || section.magnitudeOfDelay >= 1) return '#fbbc04';
  return '#1e8e5a';
}

function renderTrafficRoute(route) {
  clearRoute();
  const allPoints = flattenRoutePoints(route);
  if (!allPoints.length) return;
  routeLines.push(L.polyline(allPoints, { color: '#1e8e5a', weight: 7, opacity: 0.9, lineCap: 'round' }).addTo(map));
  (route.sections || []).filter(section => section.sectionType === 'TRAFFIC').forEach(section => {
    const segment = allPoints.slice(section.startPointIndex, section.endPointIndex + 1);
    if (segment.length > 1) routeLines.push(L.polyline(segment, { color: trafficColor(section), weight: 7, opacity: 0.98, lineCap: 'round' }).addTo(map));
  });
  document.getElementById('trafficLegend').classList.add('visible');
}

function renderRouteMetrics() {
  if (!lastLegs.length) return;
  const distance = lastLegs.reduce((sum, leg) => sum + (Number(leg.summary?.lengthInMeters) || 0), 0);
  const movingSeconds = lastLegs.reduce((sum, leg) => sum + routeDuration(leg.summary), 0);
  const pauseSeconds = stops.slice(1).reduce((sum, stop) => sum + (Number(stop.delayMinutes) || 0) * 60, 0);
  document.getElementById('totalDistance').textContent = fmtDistance(distance);
  document.getElementById('totalDuration').textContent = fmtTime(movingSeconds + pauseSeconds);
  document.getElementById('routeBadge').textContent = `${lastLegs.length} legs - <=${Math.round(kphToMph(activeVehicle().maxSpeedKph))} mph${pauseSeconds ? ` + ${Math.round(pauseSeconds / 60)} min` : ''}`;
  legsEl.innerHTML = lastLegs.map((leg, index) => {
    const pause = Number(stops[index + 1]?.delayMinutes) || 0;
    const summary = leg.summary || {};
    const trafficDelay = Number(summary.trafficDelayInSeconds) || 0;
    return `<div class="leg"><span class="leg-number">${index + 1}</span><div class="leg-route"><b>${escapeHtml(stops[index]?.name)}</b>→ ${escapeHtml(stops[index + 1]?.name)}${pause ? `<small class="delay-note">შეყოვნება: ${pause} წთ</small>` : ''}</div><div class="leg-stats">${fmtDistance(summary.lengthInMeters || 0)}<small>${fmtTime(routeDuration(summary))}${trafficDelay ? ` · +${fmtTime(trafficDelay)}` : ''}${pause ? ` + ${pause} წთ` : ''}</small></div></div>`;
  }).join('');
}

async function calculate() {
  clearTimeout(calculateTimer);
  if (!apiKey || !map || stops.some(stop => !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng))) return;
  const vehicle = activeVehicle();
  const locations = stops.map(stop => `${stop.lat},${stop.lng}`).join(':');
  const params = new URLSearchParams({
    key: apiKey,
    traffic: 'true',
    travelMode: vehicle.travelMode,
    routeRepresentation: 'polyline',
    sectionType: 'traffic'
  });
  if (vehicle.travelMode === 'truck') {
    params.set('vehicleMaxSpeed', String(Math.round(vehicle.maxSpeedKph)));
    params.set('vehicleCommercial', 'true');
    const truckParameters = {
      vehicleWeight: Math.round(vehicle.weightKg), vehicleAxleWeight: Math.round(vehicle.axleWeightKg),
      vehicleNumberOfAxles: Math.round(vehicle.axles), vehicleLength: Number(vehicle.lengthM.toFixed(2)),
      vehicleWidth: Number(vehicle.widthM.toFixed(2)), vehicleHeight: Number(vehicle.heightM.toFixed(2))
    };
    Object.entries(truckParameters).forEach(([name, value]) => { if (Number(value) > 0) params.set(name, String(value)); });
  }
  setStatus('TomTom ითვლის მარშრუტს და ცოცხალ traffic-ს…');
  try {
    const response = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?${params}`);
    const data = await response.json();
    if (!response.ok || !data.routes?.[0]) throw new Error(data?.detailedError?.message || data?.error?.description || 'მარშრუტი ვერ მოიძებნა');
    recordUsage('routing');
    const route = data.routes[0];
    lastLegs = route.legs || [];
    renderTrafficRoute(route);
    renderRouteMetrics();
    const bounds = L.latLngBounds(flattenRoutePoints(route));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48] });
    setStatus('მარშრუტი მზადაა — წითელი მონაკვეთები საცობს, ყვითელი კი შენელებას აჩვენებს.');
  } catch (error) {
    console.error(error);
    setStatus(`TomTom Routing შეცდომა: ${error.message || 'შეამოწმე API key და აქტიური სერვისები.'}`);
  }
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([40.35, -75.45], 9);
  L.tileLayer(`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}&language=en-US`, {
    maxZoom: 22,
    attribution: '&copy; TomTom'
  }).addTo(map);
  recordUsage('maps');
  map.on('click', event => {
    const index = stops.findIndex(stop => !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng));
    if (index === -1) return setStatus('ჯერ დაამატე ახალი ცარიელი გაჩერება, შემდეგ მონიშნე ის რუკაზე.');
    applyPlace({ name: `მონიშნული წერტილი ${index + 1}`, lat: event.latlng.lat, lng: event.latlng.lng }, index);
  });
  renderStops();
  renderMarkers();
  calculate();
}

document.getElementById('addStop').onclick = () => {
  stops.push({ name: '', lat: null, lng: null, delayMinutes: 0 });
  renderStops();
  document.querySelector('#stops .stop-row:last-of-type .stop-input')?.focus();
};
document.getElementById('buildRoute').onclick = calculate;
document.querySelectorAll('.mode').forEach(button => {
  button.onclick = () => {
    document.querySelector('.mode.active')?.classList.remove('active'); button.classList.add('active');
    vehicleProfile = button.dataset.profile; renderVehicleNote(); renderTruckControls();
    if (vehicleProfile === 'truck') openTruckModal(); else calculate();
  };
});
document.getElementById('closeTruckModal').onclick = closeTruckModal;
document.querySelector('[data-close-truck-modal]').onclick = closeTruckModal;
document.getElementById('truckForm').addEventListener('submit', saveTruckProfile);
document.getElementById('newTruckProfile').onclick = openNewTruckForm;
document.getElementById('backToTruckList').onclick = showTruckLibrary;

document.getElementById('locate').onclick = () => {
  if (!navigator.geolocation) return setStatus('ბრაუზერი მდებარეობას არ უჭერს მხარს.');
  navigator.geolocation.getCurrentPosition(({ coords }) => map?.panTo([coords.latitude, coords.longitude]), () => setStatus('მდებარეობის წაკითხვა ვერ მოხერხდა.'));
};

renderUsage();
renderVehicleNote();
renderTruckControls();
if (!apiKey || apiKey === 'YOUR_TOMTOM_API_KEY') {
  setStatus('TomTom-ის ჩასართავად ჩაწერე API key ფაილში maps-config.js.');
} else if (!window.L) {
  setStatus('რუკის ბიბლიოთეკა ვერ ჩაიტვირთა. შეამოწმე ინტერნეტთან კავშირი.');
} else {
  initMap();
}
