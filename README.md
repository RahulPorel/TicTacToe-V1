# 🎮 Multiplayer Tic Tac Toe - Real-Time Gaming Experience

A modern, real-time multiplayer Tic Tac Toe game built to demonstrate seamless state synchronization, authentic user competition, and a polished UI/UX. This project bridges the gap between classic gaming and modern web technologies.

**[🌐 Live Demo](https://tictactoe.rahulporel.com/)**

## Key Features

This isn't just a simple game board—it's a full-featured multiplayer platform:

- **Real-Time Multiplayer**: Instant move synchronization using Firebase Firestore listeners, ensuring a lag-free experience for both players.
- **Live Leaderboard**: Dynamic global ranking system that tracks Wins, Losses, and Draws for all players in real-time.
- **Smart Matchmaking**:
  - **Create & Share**: Generate a unique game link to challenge friends instantly.
  - **Join via ID**: Paste a Game ID or URL to jump straight into the action.
- **Persistent Identity**: Remembers users via local storage while securing unique usernames in the cloud logic.
- **Responsive & Polished UI**:
  - **Glassmorphism Design**: Modern, translucent aesthetic with blur effects.
  - **Mobile-First**: Fully responsive layout that works perfectly on phones, tablets, and desktops.
  - **Interactive Feedback**: SweetAlert2 confirmations, Toast notifications, and Confetti celebrations on victory.
- **Game State Management**: Handles edge cases like player disconnection, game resets (Play Again), and draw conditions gracefully.

## Technology Stack

Built with a focus on performance, scalability, and clean architecture:

- **Frontend**: vanilla JavaScript (ES6+), HTML5
- **Styling**: Tailwind CSS v4 (Utility-first architecture), FontAwesome
- **Backend & Database**: Firebase Firestore (NoSQL Real-time DB)
- **Authentication**: Firebase Auth (Anonymous Sessions)
- **Build Tool**: Parcel (Zero configuration bundler)
- **Libraries**:
  - `js-confetti` (Visual rewards)
  - `notifyx` (Non-intrusive notifications)
  - `sweetalert2` (Beautiful modals)

## Technical Highlights

- **Optimistic UI Updates**: The board reacts instantly to user actions while syncing securely in the background.
- **Transactional Integrity**: Firebase transactions ensure that two players cannot take the same spot or join a full game simultaneously.
- **Efficient Data Fetching**: Uses Firestore `onSnapshot` for real-time streams instead of constant polling, reducing server load and latency.

## Getting Started

Want to run this locally? Follow these steps:

1.  **Clone the repository**

    ```bash
    git clone https://github.com/RahulPorel/TicTacToe-V1.git
    cd TicTacToe-V1
    ```

2.  **Install dependencies**

    ```bash
    npm install
    # or
    pnpm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the root and add your Firebase credentials:

    ```env
    FIREBASE_API_KEY=your_api_key
    FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    FIREBASE_PROJECT_ID=your_project_id
    FIREBASE_STORAGE_BUCKET=your_project.appspot.com
    FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    FIREBASE_APP_ID=your_app_id
    ```

4.  **Start the development server**

    ```bash
    npm start
    ```

    The app will render at `http://localhost:1234`.

5.  **Build for Production**
    ```bash
    npm run build
    ```
