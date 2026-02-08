import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyDyDC1SLQDf_7YswrbTadP4Q-LbgjsEStw",
  authDomain: "sparkbill-eb3a4.firebaseapp.com",
  projectId: "sparkbill-eb3a4",
  storageBucket: "sparkbill-eb3a4.firebasestorage.app",
  messagingSenderId: "1031654652067",
  appId: "1:1031654652067:web:678a0c7f0b60593eb52716",
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);