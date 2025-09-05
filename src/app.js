import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  addDoc,
  onSnapshot,
  collection,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  setDoc,
  where,
  getDocs,
} from "firebase/firestore";

const screens = {
  auth: document.getElementById("auth-screen"),
  lounge: document.getElementById("game-lounge"),
  game: document.getElementById("game-screen"),
};
const nameInput = document.getElementById("name-input");
const loginBtn = document.getElementById("login-btn");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const joinGameInput = document.getElementById("join-game-input");
const playerNameDisplay = document.getElementById("player-name-display");
const turnIndicator = document.getElementById("turn-indicator");
const boardElement = document.getElementById("board");
const winningMessage = document.getElementById("winningMessage");
const winningMessageText = document.getElementById("winning-message-text");
const restartBtn = document.getElementById("restartBtn");
const leaderboardList = document.getElementById("leaderboard");
const playerXInfo = document.getElementById("player-x-info");
const playerOInfo = document.getElementById("player-o-info");
const shareInviteBtn = document.getElementById("share-invite-btn");
const shareFeedback = document.getElementById("share-feedback");
const leaveGameBtn = document.getElementById("leave-game-btn");
const nameTakenModal = document.getElementById("name-taken-modal");
const closeModalBtn = document.getElementById("close-modal-btn");

//  Firebase Initialization
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

//  Game State Variables
let currentUserId = null;
let currentUsername = null;
let firebaseUser = null;
let currentGameId = null;
let unsubscribeFromGame = null;
let unsubscribeFromLeaderboard = null;
let playerStatUnsubscribes = [];

const Winning_Combinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

//  Core App Functions
const showScreen = (screenName) => {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[screenName].classList.remove("hidden");
};

// This function now ONLY handles setting the initial UI state.
function initializeAppUI() {
  const storedUserId = localStorage.getItem("ticTacToeUserId");
  const storedUserName = localStorage.getItem("ticTacToeUserName");

  if (storedUserId && storedUserName) {
    currentUserId = storedUserId;
    currentUsername = storedUserName;
    playerNameDisplay.textContent = currentUsername;
    showScreen("lounge");
  } else {
    showScreen("auth");
  }
}

//  Event Listeners
loginBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter a name!");
    return;
  }
  const statsRef = collection(db, "playerStats");
  const q = query(statsRef, where("name", "==", name));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    nameTakenModal.classList.remove("hidden");
    nameTakenModal.classList.add("flex");
    return;
  }
  currentUsername = name;
  currentUserId = crypto.randomUUID();
  localStorage.setItem("ticTacToeUserId", currentUserId);
  localStorage.setItem("ticTacToeUserName", currentUsername);
  const userStatsRef = doc(db, "playerStats", currentUserId);
  await setDoc(userStatsRef, {
    name: currentUsername,
    wins: 0,
    losses: 0,
    draws: 0,
  });
  playerNameDisplay.textContent = currentUsername;
  showScreen("lounge");
  listenForLeaderboard();
  const urlParams = new URLSearchParams(window.location.search);
  const gameIdFromUrl = urlParams.get("gId");
  if (gameIdFromUrl) {
    await joinGame(gameIdFromUrl);
  }
});

closeModalBtn.addEventListener("click", () => {
  nameTakenModal.classList.add("hidden");
  nameTakenModal.classList.remove("flex");
});

// This is now the single source of truth for app readiness.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    firebaseUser = user;
    // We have a firebase session. Now, do we have a persistent local identity?
    if (currentUserId) {
      // Yes. We are a returning user. Attach listeners and handle URL joins.
      listenForLeaderboard();
      const urlParams = new URLSearchParams(window.location.search);
      const gameIdFromUrl = urlParams.get("gId");
      if (gameIdFromUrl) {
        await joinGame(gameIdFromUrl);
      }
    }
    // If currentUserId is null, we are a new user. The loginBtn handler
    // is responsible for calling listenForLeaderboard() after they sign up.
  } else {
    // User is signed out.
    firebaseUser = null;
    if (unsubscribeFromLeaderboard) unsubscribeFromLeaderboard();
  }
});

//  Game Creation and Joining
createGameBtn.addEventListener("click", async () => {
  if (!currentUserId) return;
  const gameRef = await addDoc(collection(db, "games"), {
    players: { [currentUserId]: { symbol: "X", name: currentUsername } },
    playerIds: [currentUserId],
    board: Array(9).fill(null),
    currentPlayer: "X",
    status: "waiting",
    winner: null,
    statsProcessed: false,
  });
  await joinGame(gameRef.id);
});

// TODO: URL searchParams
joinGameBtn.addEventListener("click", () => {
  const input = joinGameInput.value.trim();
  let gameId = input;
  if (input.includes("?gId=")) {
    try {
      gameId = new URL(input).searchParams.get("gId");
    } catch (error) {
      console.error("Invalid URL pasted");
      alert("The URL you pasted is not valid.");
      return;
    }
  }
  if (gameId) joinGame(gameId);
});

async function joinGame(gameId) {
  if (!currentUserId) {
    alert("You need to be logged in to join a game!");
    return;
  }
  const gameRef = doc(db, "games", gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw "Game not found!";
      const gameData = gameSnap.data();
      if (
        gameData.playerIds.length === 1 &&
        !gameData.playerIds.includes(currentUserId)
      ) {
        transaction.update(gameRef, {
          players: {
            ...gameData.players,
            [currentUserId]: { symbol: "O", name: currentUsername },
          },
          playerIds: [...gameData.playerIds, currentUserId],
          status: "playing",
        });
      } else if (!gameData.playerIds.includes(currentUserId)) {
        throw "This game is already full!";
      }
    });
    subscribeToGame(gameId);
  } catch (error) {
    console.error("Error joining game:", error);
    alert(error);
  }
}

//  Real-time Game Rendering
function createBoard() {
  boardElement.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    cell.addEventListener("click", handleCellClick);
    boardElement.appendChild(cell);
  }
}

function subscribeToGame(gameId) {
  if (unsubscribeFromGame) unsubscribeFromGame();
  currentGameId = gameId;
  showScreen("game");
  createBoard();
  const gameRef = doc(db, "games", gameId);
  unsubscribeFromGame = onSnapshot(gameRef, (doc) => {
    const gameData = doc.data();
    if (gameData) {
      renderGame(gameData);
      subscribeToPlayerStats(gameData);
    }
  });
}

function renderGame(gameData) {
  const cells = boardElement.querySelectorAll(".cell");
  gameData.board.forEach((mark, i) => {
    cells[i].classList.remove("x", "circle");
    if (mark) cells[i].classList.add(mark === "X" ? "x" : "circle");
  });

  const playerXData = Object.values(gameData.players).find(
    (p) => p.symbol === "X"
  );
  const playerOData = Object.values(gameData.players).find(
    (p) => p.symbol === "O"
  );
  playerXInfo.querySelector(
    "p.font-bold"
  ).innerHTML = `<span class="text-2xl" style="color: #00d4ff;">X</span> ${
    playerXData ? playerXData.name : "Waiting..."
  }`;
  playerOInfo.querySelector("p.font-bold").innerHTML = `${
    playerOData ? playerOData.name : "Waiting..."
  } <span class="text-2xl" style="color: #ff4d94;">O</span>`;
  playerXInfo.dataset.playerId =
    Object.keys(gameData.players).find(
      (id) => gameData.players[id].symbol === "X"
    ) || "";
  playerOInfo.dataset.playerId =
    Object.keys(gameData.players).find(
      (id) => gameData.players[id].symbol === "O"
    ) || "";
  playerXInfo.classList.remove("player-active");
  playerOInfo.classList.remove("player-active");
  playerXInfo.style.setProperty("--active-color", "transparent");
  playerOInfo.style.setProperty("--active-color", "transparent");

  if (gameData.status === "playing") {
    if (gameData.currentPlayer === "X") {
      playerXInfo.classList.add("player-active");
      playerXInfo.style.setProperty("--active-color", "#00d4ff");
    } else {
      playerOInfo.classList.add("player-active");
      playerOInfo.style.setProperty("--active-color", "#ff4d94");
    }
  }

  if (!gameData.players[currentUserId]) return;
  const mySymbol = gameData.players[currentUserId].symbol;
  const isMyTurn = gameData.currentPlayer === mySymbol;

  if (gameData.status === "playing") {
    winningMessage.classList.add("hidden");
    const currentPlayerName =
      gameData.currentPlayer === "X"
        ? playerXData.name
        : playerOData
        ? playerOData.name
        : "";
    turnIndicator.textContent = isMyTurn
      ? "Your turn!"
      : `${currentPlayerName}'s turn`;
    turnIndicator.style.color = isMyTurn
      ? mySymbol === "X"
        ? "#00d4ff"
        : "#ff4d94"
      : "#f0f0f0";
  } else if (gameData.status === "finished") {
    winningMessage.classList.remove("hidden");
    winningMessage.classList.add("flex");
    if (gameData.winner) {
      winningMessageText.textContent =
        mySymbol === gameData.winner ? "You Win!" : "You Lose!";
    } else {
      winningMessageText.textContent = "It's a Draw!";
    }
    if (mySymbol === "X") updatePlayerStats(gameData);
  } else if (gameData.status === "waiting") {
    turnIndicator.textContent = "Waiting for an opponent...";
    turnIndicator.style.color = "#f0f0f0";
  }
}

function subscribeToPlayerStats(gameData) {
  playerStatUnsubscribes.forEach((unsub) => unsub());
  playerStatUnsubscribes = [];
  gameData.playerIds.forEach((id) => {
    const playerRef = doc(db, "playerStats", id);
    const unsub = onSnapshot(playerRef, (doc) => {
      const data = doc.data();
      if (data) {
        const statsText = `W:${data.wins} / L:${data.losses} / D:${data.draws}`;
        if (playerXInfo.dataset.playerId === id)
          playerXInfo.querySelector(".player-stats").textContent = statsText;
        else if (playerOInfo.dataset.playerId === id)
          playerOInfo.querySelector(".player-stats").textContent = statsText;
      }
    });
    playerStatUnsubscribes.push(unsub);
  });
}

//  Gameplay Actions
async function handleCellClick(e) {
  const index = parseInt(e.target.dataset.index);
  if (!currentGameId || !currentUserId) return;
  const gameRef = doc(db, "games", currentGameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw "Game does not exist!";
      const gameData = gameSnap.data();
      const playerSymbol = gameData.players[currentUserId]?.symbol;
      if (
        gameData.status === "playing" &&
        gameData.currentPlayer === playerSymbol &&
        !gameData.board[index]
      ) {
        const newBoard = [...gameData.board];
        newBoard[index] = playerSymbol;
        const win = checkWin(newBoard, playerSymbol);
        const draw = !win && newBoard.every((cell) => cell !== null);
        transaction.update(gameRef, {
          board: newBoard,
          currentPlayer: playerSymbol === "X" ? "O" : "X",
          status: win || draw ? "finished" : "playing",
          winner: win ? playerSymbol : null,
        });
      }
    });
  } catch (error) {
    console.error("Cell click transaction failed: ", error);
  }
}

function checkWin(board, c) {
  return Winning_Combinations.some((comb) => comb.every((i) => board[i] === c));
}

restartBtn.addEventListener("click", async () => {
  if (!currentGameId) return;
  const gameRef = doc(db, "games", currentGameId);
  await updateDoc(gameRef, {
    board: Array(9).fill(null),
    currentPlayer: "X",
    status: "playing",
    winner: null,
    statsProcessed: false,
  });
});

leaveGameBtn.addEventListener("click", () => {
  if (unsubscribeFromGame) unsubscribeFromGame();
  playerStatUnsubscribes.forEach((unsub) => unsub());
  playerStatUnsubscribes = [];
  currentGameId = null;
  showScreen("lounge");
  // UX FIX: Clean the URL to remove the game ID query parameter
  window.history.pushState({}, document.title, window.location.pathname);
});

shareInviteBtn.addEventListener("click", async () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?gId=${currentGameId}`;
  const shareData = {
    title: "Tic-Tac-Toe Challenge!",
    text: `Come play Tic-Tac-Toe with me!`,
    url: shareUrl,
  };
  try {
    if (navigator.share) {
      await navigator.clipboard.writeText(shareUrl);
      await navigator.share(shareData);
      shareFeedback.textContent = "Invite sent & URL copied!";
    } else {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.textContent = "Invite URL copied!";
    }
  } catch (err) {
    console.error("Share failed:", err);
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.textContent = "Sharing failed, URL copied instead!";
    } catch (copyErr) {
      console.error("Copy failed:", copyErr);
      shareFeedback.textContent = "Could not copy URL.";
      shareFeedback.classList.replace("text-green-400", "text-red-400");
    }
  }
  shareFeedback.classList.remove("opacity-0");
  setTimeout(() => {
    shareFeedback.classList.add("opacity-0");
    shareFeedback.classList.replace("text-red-400", "text-green-400");
  }, 3000);
});

//  Leaderboard and Stats Update Logic
async function updatePlayerStats(gameData) {
  if (gameData.statsProcessed) return;
  const winnerSymbol = gameData.winner;
  const winnerId = Object.keys(gameData.players).find(
    (key) => gameData.players[key].symbol === winnerSymbol
  );
  const isDraw = !winnerSymbol;
  for (const playerId of gameData.playerIds) {
    const playerRef = doc(db, "playerStats", playerId);
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        const data = playerDoc.data() || {};
        let { wins = 0, losses = 0, draws = 0 } = data;
        if (isDraw) draws++;
        else if (playerId === winnerId) wins++;
        else losses++;
        transaction.set(
          playerRef,
          { ...data, wins, losses, draws },
          { merge: true }
        );
      });
    } catch (e) {
      console.error(
        `Stat update transaction for player ${playerId} failed:`,
        e
      );
    }
  }
  await updateDoc(doc(db, "games", currentGameId), { statsProcessed: true });
}

function listenForLeaderboard() {
  if (unsubscribeFromLeaderboard) unsubscribeFromLeaderboard();
  const q = query(
    collection(db, "playerStats"),
    orderBy("wins", "desc"),
    limit(100)
  );
  unsubscribeFromLeaderboard = onSnapshot(q, (snapshot) => {
    leaderboardList.innerHTML = "";
    if (snapshot.empty) {
      leaderboardList.innerHTML =
        "<p class='text-gray-400 text-center'>No games played yet!</p>";
      return;
    }
    let rank = 1;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const li = document.createElement("li");
      li.className =
        "flex items-center justify-between p-2 rounded-lg bg-black/20";
      li.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-lg w-6 text-center">${rank}.</span>
                <span class="font-semibold">${data.name || "Anonymous"}</span>
            </div>
            <div class="flex items-center gap-4 text-sm">
                <span class="font-bold text-green-400" title="Wins"><i class="fa-solid fa-crown"></i> ${
                  data.wins || 0
                }</span>
                <span class="font-bold text-red-400" title="Losses"><i class="fa-solid fa-shield-halved"></i> ${
                  data.losses || 0
                }</span>
                <span class="font-bold text-gray-400" title="Draws"><i class="fa-solid fa-handshake"></i> ${
                  data.draws || 0
                }</span>
            </div>`;
      leaderboardList.appendChild(li);
      rank++;
    });
  });
}

//  Initialize the App
// 1. Set up the initial UI based on what's in localStorage
initializeAppUI();
// 2. Ensure we have a Firebase session. onAuthStateChanged will handle the rest.
signInAnonymously(auth);
