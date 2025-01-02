import zoomSdk from "@zoom/appssdk"

async function configureApp() {
  const configResponse = await zoomSdk.config({
    popoutSize: {width: 480, height: 360},
    capabilities: [
    "listCameras",
    "setCamera",
    "setVideoMirrorEffect",
    "getMeetingParticipants",
    "cloudRecording",
    "allowParticipantToRecord",
    "getRunningContext",
    "getMeetingContext",
    "getSupportedJsApis",
    "showNotification",
    "openUrl",
    "setVirtualBackground",
    "listCameras",
    "setCamera",
    "sendAppInvitation",
    "sendAppInvitationToAllParticipants",
    "getUserContext",
    "getRecordingContext",
    "getMeetingContext",
    "getMeetingJoinUrl",
    "getMeetingUUID",
    "expandApp",
    "connect",
    "postMessage",
    //Events
    "onShareApp",
    "onSendAppInvitation",
    "onCloudRecording",
    "onActiveSpeakerChange",
    "onAppPopout",
    "onCohostChange",
    "onParticipantChange",
    "onReaction",
    "onConnect",
    "onExpandApp",
    "onMessage",
    "onMeeting",
    ]
  })
}

configureApp()