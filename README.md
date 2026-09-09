# Nami 🏍️⚡

> **Real-Time Group Navigation & Situational Awareness Telemetry for Motorcycle & Cycling Convoys**

[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo%20SDK-54-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%26%20Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![OSRM](https://img.shields.io/badge/Routing-OSRM%20Engine-brightgreen)](https://project-osrm.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Overview

Group riding at highway speeds (60–100 km/h) is inherently dangerous. In a convoy, when a rider encounters a mechanical issue, takes a wrong turn, or crashes, it often takes miles for the rest of the squad to realize someone is missing. Checking phone screens while riding is hazardous.

**Nami** solves this with a low-latency, distributed telemetry and situational awareness platform built specifically for two-wheelers. It provides sub-second GPS tracking, an off-screen radar HUD that projects out-of-view riders onto your screen perimeter, hands-free turn-by-turn voice synthesis, crowdsourced hazard reporting, and one-tap emergency SOS dispatch.

---

## ✨ Key Features

### 📡 1. Sub-Second Real-Time Telemetry (1 Hz)
* Streams live GPS coordinates, heading angle (0–360°), speed (km/h), and battery percentage.
* Built using `expo-location` and Google Cloud Firestore subcollections (`/rides/{rideId}/locations/{userId}`) to eliminate single-document write lock contention.
* Custom animated circular map markers with dynamic `tracksViewChanges` throttling for buttery-smooth 60 FPS rendering.

### 🧭 2. Viewport-Aware Trigonometric Edge Radar
* When squad members fall off the visible map viewport, custom radar badges render along the screen perimeter.
* Computes delta coordinates relative to map center, calculates the polar angle using $\theta = \text{atan2}(d\text{Lat}, d\text{Lng})$, and projects elliptical screen coordinates clamped to safe boundaries.
* Calculates great-circle distance using the **Haversine Formula** and maps angles to 8 directional arrow octants.

### 🎙️ 3. Hands-Free Audio HUD (Text-to-Speech)
* Synthesizes turn maneuvers, hazard alerts, and emergency SOS broadcasts into voice via `expo-speech`.
* In-memory utterance queue with deduplication suppresses redundant announcements when fluctuating near maneuver boundaries.

### 🚨 4. One-Tap Emergency SOS Dispatch
* Press and hold the SOS button (1.5s hold-to-activate) to broadcast high-priority distress status to all squad members.
* Escalates on squad devices with full-screen `EmergencyAlertOverlay`, continuous haptic vibration loops, and automated voice dispatch.
* Resilient 3-attempt exponential retry loop ensures dispatch even in weak cellular connectivity.

### 🛡️ 5. Cryptographic QR & 6-Digit Squad Pairing
* Instant session joining via QR scan or 6-character room codes.
* Generates cryptographically salted, timestamped join tokens (`NAMI:{...}`).
* Solves camera multi-frame 30 FPS race conditions using atomic `useRef` scan locking and 2000ms debouncing.
* Backward compatible with legacy codes and deep links.

### 💾 6. Dual-Tier Resilient Ride History
* Dual-persisted across local `@react-native-async-storage/async-storage` (0ms offline retrieval) and Cloud Firestore (`/users/{uid}/ride_history`).
* Captures route duration, total distance, average speed, top speed, and squad attendance.

### ⚠️ 7. Real-Time Road Hazard Panning
* Pin and broadcast road hazards (Potholes, Police, Traffic, Accidents, Animals, Weather) in real time.

---

## 🏗️ System Architecture

```
[ Mobile Client (React Native + Expo) ]
  ├── Presentation Layer (Screens & Custom Map Markers)
  │     ├── HomeScreen, CreateRideScreen, JoinRideScreen
  │     ├── RideScreen (Interactive HUD & MapView)
  │     └── RideSummaryScreen
  │
  ├── Custom Component Layer
  │     ├── AnimatedRiderMarker (60 FPS circular navigation puck)
  │     ├── BikerRadarEdgeIndicator (atan2 off-screen radar)
  │     ├── EmergencyAlertOverlay & PersistentEmergencyBanner
  │     └── SelectedRiderCard & ActiveRideBanner
  │
  ├── State & Hook Layer
  │     ├── AuthContext / useAuth (JWT token session management)
  │     ├── useRide (Ride state machine: lobby -> active -> completed)
  │     ├── useRiderLocations (onSnapshot Firestore subcollection stream)
  │     └── useCompass (Magnetometer low-pass filtered orientation)
  │
  ├── Business Service Layer
  │     ├── LocationService (GPS 1 Hz stream, battery level, SOS retry loop)
  │     ├── RideService (Session lifecycle, QR generator, dual-tier history)
  │     ├── NavigationService (OSRM turn-by-turn routing engine)
  │     ├── SpeechService (expo-speech audio HUD queue)
  │     └── HazardService, GeocodingService, WeatherService
  │
  └── Hardware & External Services
        ├── Local: GPS, Magnetometer, Battery, TTS, AsyncStorage, SecureStore
        ├── Cloud Firestore (NoSQL subcollections & security rules)
        ├── Firebase Authentication (Google OAuth & Email/Password)
        └── External APIs: OSRM, OpenRouteService, Komoot Photon, Open-Meteo
```

---

## 📂 Project Structure

```
BikeRadar/
├── assets/                  # App icons, splash screens, and adaptive assets
├── firestore.rules          # Production Firestore security & authorization rules
├── firebase.json            # Firebase CLI configuration
├── app.json                 # Expo project configuration (Nami)
├── app.config.js            # Dynamic Expo environment configuration
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── Nami_SDE_Interview_Preparation_Guide.pdf # Complete SDE interview guide (1.4 MB)
│
└── src/
    ├── components/          # Reusable UI components
    │   ├── AnimatedRiderMarker.tsx       # 60 FPS circular rider map marker
    │   ├── BikerRadarEdgeIndicator.tsx   # Trigonometric off-screen radar HUD
    │   ├── EmergencyAlertOverlay.tsx     # Full-screen SOS distress modal
    │   ├── PersistentEmergencyBanner.tsx # Top emergency alert banner
    │   ├── ActiveRideBanner.tsx          # Home active ride banner
    │   ├── SelectedRiderCard.tsx         # Bottom telemetry drawer
    │   └── RideInviteCard.tsx            # QR code invite modal
    │
    ├── context/             # Global React Context
    │   └── AuthContext.tsx  # Authentication session & profile state
    │
    ├── hooks/               # Custom React hooks
    │   ├── useRide.ts            # Active ride session subscription
    │   ├── useRiderLocations.ts  # Real-time 1 Hz telemetry listener
    │   ├── useCompass.ts         # Filtered magnetometer orientation
    │   └── useTheme.tsx          # High-contrast navigation palettes
    │
    ├── screens/             # Application screen views
    │   ├── SplashScreen.tsx
    │   ├── LoginScreen.tsx
    │   ├── HomeScreen.tsx
    │   ├── CreateRideScreen.tsx
    │   ├── JoinRideScreen.tsx
    │   ├── WaitingLobbyScreen.tsx
    │   ├── RideScreen.tsx
    │   ├── RideSummaryScreen.tsx
    │   └── SettingsScreen.tsx
    │
    ├── services/            # Decoupled business logic & external APIs
    │   ├── LocationService.ts       # 1 Hz GPS & SOS broadcast service
    │   ├── RideService.ts           # Session management & dual-tier cache
    │   ├── NavigationService.ts     # OSRM & OpenRouteService routing
    │   ├── SpeechService.ts         # Hands-free audio queue
    │   ├── HazardService.ts         # Road hazard reports
    │   ├── GeocodingService.ts      # Photon & Nominatim search
    │   ├── WeatherService.ts        # Open-Meteo weather API
    │   ├── AuthService.ts           # Firebase authentication wrapper
    │   └── SecureStorageService.ts  # Hardware-backed SecureStore
    │
    └── utils/               # Helper utilities & algorithms
        ├── firestoreSanitizer.ts    # Recursive undefined-stripping sanitizer
        ├── qrCodeGenerator.ts       # Cryptographic QR payload & parser
        └── index.ts                 # Haversine distance & formatting helpers
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v18.0 or higher
* **npm** or **yarn**
* **Expo CLI**: `npm install -g expo-cli`
* **Android Studio / Xcode** (for simulator/device builds) or **Expo Go** app on physical device.
* **JDK 17** (for local Android debug APK compilation)

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/avikurne05/BikeRadar.git
   cd BikeRadar
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the project root:
   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=bikerradar-8cb09
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key
   ```

4. **Run the Development Server**:
   ```bash
   npx expo start
   ```

5. **Build & Install Local Android Debug APK**:
   ```bash
   JAVA_HOME=/path/to/jdk17 ./android/gradlew -p android assembleDebug
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## 🔒 Firestore Security Rules

Nami enforces document-level authorization via `firestore.rules`:
* Riders can only create and update their own telemetry (`/rides/{rideId}/locations/{userId}`).
* Only the ride leader can delete or archive the master ride.
* Ride history subcollections (`/users/{userId}/ride_history/{historyId}`) are strictly restricted to the authenticated user.

Deploy rules via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## 📚 SDE Interview Manual

Included in this repository is the complete **Nami SDE Interview Preparation Guide**:
* 📄 [**`Nami_SDE_Interview_Preparation_Guide.pdf`**](./Nami_SDE_Interview_Preparation_Guide.pdf) *(1.4 MB)*
* 🌐 [**`nami_sde_interview_prep.html`**](./nami_sde_interview_prep.html)

Contains full architectural deep dives, data flow traces, whiteboard Haversine derivations, Firestore consistency analyses, 50+ categorized interview questions, and speaking scripts.

---

## 👨‍💻 Author

* **Avinash Kurne** — [@avikurne05](https://github.com/avikurne05)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
