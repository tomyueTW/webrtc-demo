import logo from './logo.svg';
import './App.css';
import { useRef, useState, useEffect } from "react";

//使用 stream 更新 ref 
export default function App() {

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);

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

  useEffect(() => {
    openMedia();
  }, []);

  return (
    <div>
      <button onClick={openMedia}>Open Media</button>
      <br />
      {/* local 需要 muted */}
      <video ref={localVideoRef} autoPlay muted playsInline />
      <br />
      <video ref={remoteVideoRef} autoPlay playsInline />
    </div>
  );
}
