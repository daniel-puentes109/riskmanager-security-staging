const firebaseConfig = {
  apiKey: "AIzaSyBsS-jH21LLPqcX-d4fYY5Qvq2jOFXs6fc",
  authDomain: "riskops-75637.firebaseapp.com",
  projectId: "riskops-75637",
  storageBucket: "riskops-75637.firebasestorage.app",
  messagingSenderId: "874205588056",
  appId: "1:874205588056:web:95eb04536fd4586e26b82d",
  databaseURL: "https://riskops-75637-default-rtdb.firebaseio.com"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
