/* ============================================================
   TrailBlaze Adventure Tours — booking page logic
   ============================================================
   1. Loads live weather for the selected trail from Open-Meteo
      (free, no API key, CORS-enabled — https://open-meteo.com).
   2. Validates and submits the booking form to a Google Apps
      Script Web App, which emails a PDF receipt to the user.
   ============================================================ */

// ---- 1. PASTE YOUR DEPLOYED APPS SCRIPT WEB APP URL HERE ----
// Deploy Code.gs as a Web App ("Execute as: Me", "Who has access: Anyone"),
// then paste the resulting /exec URL below.
const SCRIPT_URL ="https://script.google.com/macros/s/AKfycbytqulgm41hf5nkS387fhEMPpQzOD4kLU2VYFtt7mcciukF3976DJhUSgG9iQ26hP2E/exec"

// ---- Trail catalogue (coordinates used for the weather API) ----
const TRAILS = [
  { id: "pulag",   name: "Mt. Pulag, Benguet",     lat: 16.5997, lon: 120.8991,
    desc: "The 'Playground of the Gods'. A classic sunrise-over-the-clouds sea trek." },
  { id: "batulao", name: "Mt. Batulao, Batangas",   lat: 14.0333, lon: 120.8167,
    desc: "Rolling grassy ridgelines close to Manila — great for beginners." },
  { id: "taal",    name: "Taal Volcano, Batangas",  lat: 14.0113, lon: 120.9977,
    desc: "A boat ride plus a short crater-rim hike on the world's smallest active volcano." },
  { id: "pinatubo", name: "Mt. Pinatubo, Zambales", lat: 15.1429, lon: 120.3496,
    desc: "4x4 ride through lahar canyons ending at a turquoise crater lake." }
];

// WMO weather codes (subset) used by Open-Meteo → human-readable label + emoji
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Dense drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm w/ hail", "⛈️"], 99: ["Thunderstorm w/ hail", "⛈️"]
};

let currentForecast = null; // holds the last fetched daily forecast for the date-check

const trailSelect  = document.getElementById("trailSelect");
const trailDesc    = document.getElementById("trailDesc");
const weatherCard  = document.getElementById("weatherCard");
const forecastNote = document.getElementById("forecastNote");
const dateInput    = document.getElementById("date");
const form         = document.getElementById("bookingForm");
const submitBtn    = document.getElementById("submitBtn");
const formStatus   = document.getElementById("formStatus");

function init() {
  // populate trail dropdown
  trailSelect.innerHTML = TRAILS.map(t => `<option value="${t.id}">${t.name}</option>`).join("");

  // date field: today .. +15 days (matches the 16-day forecast window we request)
  const today = new Date();
  const max = new Date(); max.setDate(max.getDate() + 15);
  dateInput.min = today.toISOString().slice(0, 10);
  dateInput.max = max.toISOString().slice(0, 10);
  dateInput.value = today.toISOString().slice(0, 10);

  trailSelect.addEventListener("change", onTrailChange);
  dateInput.addEventListener("change", updateForecastNote);
  form.addEventListener("submit", onSubmit);

  onTrailChange();
}

function currentTrail() {
  return TRAILS.find(t => t.id === trailSelect.value) || TRAILS[0];
}

async function onTrailChange() {
  const trail = currentTrail();
  trailDesc.textContent = trail.desc;
  weatherCard.innerHTML = `<p class="muted">Loading current weather…</p>`;
  forecastNote.hidden = true;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${trail.lat}&longitude=${trail.lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=16`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather service returned " + res.status);
    const data = await res.json();
    currentForecast = data.daily;
    renderCurrentWeather(data.current);
    updateForecastNote();
  } catch (err) {
    weatherCard.innerHTML = `<p class="muted">Couldn't load weather right now (${err.message}). You can still book.</p>`;
    currentForecast = null;
  }
}

function renderCurrentWeather(current) {
  const [label, icon] = WEATHER_CODES[current.weather_code] || ["Unknown", "❔"];
  weatherCard.innerHTML = `
    <div class="temp">${icon} ${Math.round(current.temperature_2m)}°C</div>
    <div class="desc">${label} at the trailhead right now</div>
    <div class="details">
      <span>💨 Wind: ${Math.round(current.wind_speed_10m)} km/h</span>
    </div>`;
}

// Look up the daily forecast entry for the chosen date and warn about rain risk.
// This is where the API data is actively used to inform the booking decision.
function updateForecastNote() {
  if (!currentForecast) { forecastNote.hidden = true; return; }
  const idx = currentForecast.time.indexOf(dateInput.value);
  if (idx === -1) {
    forecastNote.hidden = true; // date outside the 16-day forecast window
    return;
  }
  const rainChance = currentForecast.precipitation_probability_max[idx];
  const hi = Math.round(currentForecast.temperature_2m_max[idx]);
  const lo = Math.round(currentForecast.temperature_2m_min[idx]);
  const rainy = rainChance >= 50;

  forecastNote.hidden = false;
  forecastNote.className = "forecast-note " + (rainy ? "rain" : "clear");
  forecastNote.textContent = rainy
    ? `⚠️ ${rainChance}% chance of rain on ${dateInput.value} (${lo}–${hi}°C). Consider rain gear or a different date.`
    : `✅ ${rainChance}% chance of rain on ${dateInput.value} (${lo}–${hi}°C). Good hiking conditions expected.`;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function onSubmit(e) {
  e.preventDefault();
  formStatus.textContent = "";
  formStatus.className = "form-status";

  const email = document.getElementById("email").value.trim();
  if (!isValidEmail(email)) {
    formStatus.textContent = "Please enter a valid email address.";
    formStatus.className = "form-status err";
    return;
  }
  if (SCRIPT_URL.includes("PASTE_YOUR")) {
    formStatus.textContent = "Developer setup needed: add your Apps Script Web App URL in script.js.";
    formStatus.className = "form-status err";
    return;
  }

  const trail = currentTrail();
  const payload = {
    name: document.getElementById("name").value.trim(),
    email: email,
    phone: document.getElementById("phone").value.trim(),
    trail: trail.name,
    date: dateInput.value,
    hikers: document.getElementById("hikers").value,
    requests: document.getElementById("requests").value.trim(),
    weather: weatherCard.textContent.replace(/\s+/g, " ").trim()
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";
  formStatus.textContent = "Submitting your booking and generating your receipt…";

  try {
    // Content-Type text/plain avoids a CORS preflight (OPTIONS) request,
    // which Apps Script Web Apps do not handle. See README for details.
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      formStatus.textContent = `Booking confirmed! Reference ${result.bookingId}. Check ${email} for your PDF receipt.`;
      formStatus.className = "form-status ok";
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
    } else {
      throw new Error(result.error || "Unknown error from the server.");
    }
  } catch (err) {
    formStatus.textContent = "Something went wrong: " + err.message + ". Please try again.";
    formStatus.className = "form-status err";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Booking";
  }
}

init();
