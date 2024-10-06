import logo from './logo.svg';
import './App.css';
import { useRef, useEffect, useState } from "react";
import { db } from "./firebaseConfig";
import { collection, addDoc, getDoc, doc } from "firebase/firestore";

//使用 stream 更新 ref 
export default function App() {

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const [roomInput, setRoomInput] = useState("");

  async function openMedia() {
    try {
      // 獲取 local 的 video&audio
      const constraints = { video: true, audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // 若有 localVideoRef 則更新至 video srcObject
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 更新 localStream 和 remoteStream 
      localStream.current = stream;
      remoteStream.current = new MediaStream();
      console.log(localStream.current, remoteStream.current);
    } catch (error) {
      console.log(error);
      window.alert("請確認已開啟視訊及麥克風");
    }
  }

  

  async function createRoom() {
    // 若沒有媒體則 return
   if (!localStream.current) {
      alert('請先開啟視訊及麥克風');
      return;
    }

    // 創建房間，並 alert doc id
    const roomRef = await addDoc(collection(db, "rooms"), {});
    const roomId = roomRef.id;
    console.log('createRoom', roomId);
  }

  // 新增 joinRoom
	async function joinRoom(roomId) {

		if (!localStream.current) return;

	  const roomRef = doc(db, "rooms", roomId);
	  const roomSnapshot = await getDoc(roomRef);
    console.log('joinRoom', roomSnapshot);
	}

  useEffect(() => {
    openMedia();
  }, []);

  return (
    <div>
      <button onClick={openMedia}>Open Media</button>
      <br />
      <button onClick={createRoom}>createRoom</button>
      <br />
      <input
      value={roomInput}
      onChange={(e) => {
        setRoomInput(e.target.value);
	      }}
	    />
      <button onClick={() => joinRoom(roomInput)}>joinRoom</button>
      <br />
      {/* local 需要 muted */}
      <video ref={localVideoRef} autoPlay muted playsInline />
      <br />
      <video ref={remoteVideoRef} autoPlay playsInline />
    </div>
  );
}
