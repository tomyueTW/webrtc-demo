import logo from './logo.svg';
import './App.css';
import { useRef, useEffect, useState } from "react";
import { db } from "./firebaseConfig";
import { collection, addDoc, getDoc, doc, setDoc, updateDoc, onSnapshot, getDocs, deleteDoc } from "firebase/firestore";

//使用 stream 更新 ref 
export default function App() {

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isCall, setIsCall] = useState(false);
  const [peerConnection, setPeerConnection] = useState(null);
  const configuration = {
    iceServers: [
      {
        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"]
      }
    ],
    iceCandidatePoolSize: 10
  };
  const [videoState, setVideoState] = useState({
    isMuted: false,
    isVideoDisabled: false,
  });

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

    const pc = new RTCPeerConnection(configuration);

    // 創建房間，並 alert doc id
    const roomRef = await addDoc(collection(db, "rooms"), {});
    setRoomId(roomRef.id);
    console.log('createRoom', roomId);

    // 收集 ice candidates
    collectIceCandidates(roomRef, pc, "calleeCandidates", "callerCandidates")

    // 將 localStream 中的媒體加入至 pc 中
    localStream.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    // 從事件中取得 streams
    // 檢查是否已經存在 remoteStream，如果存在，將媒體軌道添加到其中
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
          remoteStream.current.addTrack(track);
    });
		
		// 將 remoteVideoRef 的 srcObject 設定為 remoteStream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    };

    // 1. 建立 offer 
    const offer = await pc.createOffer();
    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    };

    // 2. offer 設定 setLocalDescription，放在 db 中交換
    await pc.setLocalDescription(offer);
    await setDoc(roomRef, roomWithOffer);

    // 7. 監聽並收到 Answer
	  // 8. Answer 設定 RemoteDescription
    onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(rtcSessionDescription);
      }
    });
    
  }

	async function joinRoom(roomId) {

		if (!localStream.current) return;

	  const roomRef = doc(db, "rooms", roomId);
	  const roomSnapshot = await getDoc(roomRef);
    console.log('joinRoom', roomSnapshot);

    if (roomSnapshot.exists() === false) {
      console.log('joinRoom', '您輸入的聊天室 id 不存在');
      alert('您輸入的聊天室 id 不存在');
      return;
    }

    // 創建一個新的 RTCPeerConnection
    const pc = new RTCPeerConnection(configuration);

    // 收集 ice candidates
    collectIceCandidates(roomRef, pc, "callerCandidates", "calleeCandidates")
    
    localStream.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.current.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }
    };

    // 3. 尋找 db 中的 offer
    // 4. offer 設定 RemoteDescription
    const offer = roomSnapshot.data()?.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // 5. 建立 Answer
    // 6. Answer 設定 LocalDescription，放在 db 中交換
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    };
    await updateDoc(roomRef, roomWithAnswer);
	}

  async function collectIceCandidates(
    roomRef,
    peerConnection,
    localName,
    remoteName
  ) {
    // callerCandidates 存儲本地 ICE 候選者
    const candidatesCollection = collection(roomRef, localName);
  
    try {
      // 當收集到一個本地 ICE 候選者時，將觸發這個事件
      peerConnection.onicecandidate = async (event) => {
        // 如果事件中存在候選者，則將其轉換為 JSON 對象並添加到 candidatesCollection 中
        if (event.candidate) {
          console.log(event);
          await addDoc(candidatesCollection, event.candidate.toJSON());
        }
      };
  
      // 收集到一個本地 ICE 候選者時錯誤則觸發
      peerConnection.onicecandidateerror = (error) => {
        console.log("error", error);
      };
  
      // 監聽 calleeCandidates 裡的每個 doc
      const remoteCandidatesCollection = collection(roomRef, remoteName);
      onSnapshot(remoteCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            // 對於每個新增的遠程 ICE 候選者，將其轉換為 RTCIceCandidate
            const data = change.doc.data();
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
    } catch (error) {
      console.error(error);
    }
  }

  function toggleMute() {
    if (!localStream.current) return;
    // 獲取本地音訊軌道
    const audioTracks = localStream.current.getAudioTracks();
    console.log(audioTracks);
		
    if (audioTracks.length > 0) {
      // 切換音訊軌道的靜音狀態
      audioTracks[0].enabled = !audioTracks[0].enabled;

      // 更新狀態
      setVideoState((prevState) => ({
        ...prevState,
        isMuted: !audioTracks[0].enabled
      }));
    }
  }

  function toggleVideo() {
    if (!localStream.current) return;
    // 獲取本地視訊軌道
    const videoTracks = localStream.current.getVideoTracks();
    console.log(videoTracks);

    if (videoTracks.length > 0) {
      // 切換視訊軌道的啟用狀態
      videoTracks[0].enabled = !videoTracks[0].enabled;

      // 更新狀態
      setVideoState((prevState) => ({
        ...prevState,
        isVideoDisabled: !videoTracks[0].enabled
      }));
    }
  }

  async function hangUp() {
		// 停止本地流和遠端流中的所有媒體軌道
    localStream.current?.getTracks().forEach((track) => track.stop());
    remoteStream.current?.getTracks().forEach((track) => track.stop());

		// 關閉 RTCPeerConnection
    peerConnection?.close();
    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
    // 重置相關狀態和視訊元素
    setVideoState({
      isMuted: false,
      isVideoDisabled: false,
    });
    setPeerConnection(null);
    setRoomId('');
    window.alert('通話已結束');

    if (roomId !== '') {
      const roomRef = doc(db, 'rooms', roomId);
      console.log('roomSnapshot.exists()');
      await updateDoc(roomRef, { callEnded: true });
      const calleeCandidatesRef = collection(roomRef, 'calleeCandidates');
      const callerCandidatesRef = collection(roomRef, 'callerCandidates');

      // 刪除 calleeCandidates 集合中的文件
      const calleeCandidatesQuery = await getDocs(calleeCandidatesRef);
      calleeCandidatesQuery.forEach(async (candidate) => {
        await deleteDoc(candidate.ref);
      });
      // 刪除 callerCandidates 集合中的文件
      const callerCandidatesQuery = await getDocs(callerCandidatesRef);
      callerCandidatesQuery.forEach(async (candidate) => {
        await deleteDoc(candidate.ref);
      });
      // 刪除 rooms 集合中的文件
      await deleteDoc(roomRef);
    }
  }

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isCall && roomId) {
        e.preventDefault();
        e.returnValue = '您確定要離開視訊通話嗎？未保存的更改可能會丟失。';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCall, roomId]);

  return (
    <div>
      <button onClick={openMedia}>Open Media</button>
      <button onClick={hangUp}>Close Media</button>
      <br />
      <input value={roomId} onChange={(e) => {
        setRoomId(e.target.value);
	      }}/>
      <button onClick={createRoom}>createRoom</button>
      <br />
      <br />
      <input
      value={roomInput}
      onChange={(e) => {
        setRoomInput(e.target.value);
	      }}
	    />
      <button onClick={() => joinRoom(roomInput)}>joinRoom</button>
      <br />
      <button onClick={() => toggleMute()}>
        {videoState.isMuted ? "開音訊" : "關音訊"}
      </button>
      <button onClick={() => toggleVideo()}>
        {videoState.isVideoDisabled ? "開視訊" : "關視訊"}
      </button>
      <br />
      <br />
      {/* local 需要 muted */}
      <video ref={localVideoRef} autoPlay muted playsInline />
      <br />
      <video ref={remoteVideoRef} autoPlay playsInline />
    </div>
  );
}
