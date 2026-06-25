using System;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

/// <summary>
/// Handles all REST API calls to the CrewConnect mock/real API.
/// Attach to a persistent GameObject (e.g., GameManager).
/// Replace BASE_URL with your PC's IP when testing on Quest.
///
/// New Flow:
/// 1. GetAvailableEvents() → user selects event
/// 2. GetEventRoster(eventId) → user picks their name from roster
/// 3. SendVerificationCode(eventId, attendeeId) → SMS code sent to attendee
/// 4. VerifyAndJoin(eventId, attendeeId, code) → returns role, slot, Photon info
/// 5. Unity joins/creates Photon room based on response
/// </summary>
public class CrewConnectRestApi : MonoBehaviour
{
    // Change this to your PC IP for Quest testing (e.g., "http://192.168.1.20:5055")
    public string baseUrl = "http://localhost:5055";

    #region Data Models

    // ── Roster ──
    [Serializable] public class RosterAttendee
    {
        public string attendeeId;
        public string name;
        public string company;
        public string crew;
        public string role;
    }

    [Serializable] public class RosterResponse
    {
        public bool success;
        public string eventId;
        public RosterAttendee[] roster;
    }

    // ── Send Code ──
    [Serializable] public class SendCodeRequest { public string attendeeId; }
    [Serializable] public class SendCodeResponse
    {
        public bool success;
        public int codeLength;
        public int expiresInSeconds;
        public string message;
    }

    // ── Verify & Join ──
    [Serializable] public class VerifyAndJoinRequest { public string attendeeId; public string code; }
    [Serializable] public class VerifyAndJoinResponse
    {
        public bool success;
        public string accessToken;
        public UserData user;
        public EventData eventData;
        public RoleAssignment roleAssignment;
        public PhotonData photon;
    }

    [Serializable] public class UserData
    {
        public string userId;
        public string attendeeId;
        public string displayName;
        public string company;
        public string crew;
    }

    [Serializable] public class EventData
    {
        public string eventId; public string eventName; public string eventType;
        public string status; public bool joinWindowOpen; public string photonSessionName;
        public int maxTrainerSlots; public int maxTraineeSlots; public bool observersAllowed;
    }

    [Serializable] public class RoleAssignment
    {
        public string eventRole;
        public string activeSessionRole;
        public string slotId;
        public bool isPrimaryTrainer;
    }

    [Serializable] public class PhotonData
    {
        public string photonSessionName;
        public bool oneEventOneRoom;
        public bool roomAlreadyCreated;
        public bool createdPhotonRoomByThisUser;
    }

    // ── Events ──
    [Serializable] public class EventsResponse { public EventData[] events; }

    // ── Session Status ──
    [Serializable] public class SessionStatusResponse
    {
        public bool success; public string eventId; public string status;
        public string photonSessionName; public bool roomCreated;
        public string activeTrainerUserId; public int availableTraineeSlots;
        public bool observersAllowed;
    }

    // ── Generic ──
    [Serializable] public class GenericResponse { public bool success; public string message; }
    [Serializable] public class HeartbeatResponse { public bool success; public string message; public string userId; public long timestamp; }

    #endregion

    #region API Methods

    /// <summary>Step 2: GET /api/vr/events/available — fetch active training events</summary>
    public void GetAvailableEvents(Action<EventsResponse> onSuccess, Action<string> onError)
    {
        StartCoroutine(GetRequest($"{baseUrl}/api/vr/events/available", (json) =>
        {
            var response = JsonUtility.FromJson<EventsResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>Step 4: GET /api/vr/events/{eventId}/roster — get attendee list (no phone numbers)</summary>
    public void GetEventRoster(string eventId, Action<RosterResponse> onSuccess, Action<string> onError)
    {
        StartCoroutine(GetRequest($"{baseUrl}/api/vr/events/{eventId}/roster", (json) =>
        {
            var response = JsonUtility.FromJson<RosterResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>Step 6: POST /api/vr/events/{eventId}/send-code — request SMS verification code</summary>
    public void SendVerificationCode(string eventId, string attendeeId, Action<SendCodeResponse> onSuccess, Action<string> onError)
    {
        var body = new SendCodeRequest { attendeeId = attendeeId };
        StartCoroutine(PostRequest($"{baseUrl}/api/vr/events/{eventId}/send-code", JsonUtility.ToJson(body), (json) =>
        {
            var response = JsonUtility.FromJson<SendCodeResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>Steps 7-9: POST /api/vr/events/{eventId}/verify-and-join — verify code & get role + Photon info</summary>
    public void VerifyAndJoin(string eventId, string attendeeId, string code, Action<VerifyAndJoinResponse> onSuccess, Action<string> onError)
    {
        var body = new VerifyAndJoinRequest { attendeeId = attendeeId, code = code };
        StartCoroutine(PostRequest($"{baseUrl}/api/vr/events/{eventId}/verify-and-join", JsonUtility.ToJson(body), (json) =>
        {
            // Fix: JsonUtility can't deserialize "event" key (reserved), rename in JSON
            json = json.Replace("\"event\":", "\"eventData\":");
            var response = JsonUtility.FromJson<VerifyAndJoinResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>GET /api/vr/events/{eventId}/session-status</summary>
    public void GetSessionStatus(string eventId, Action<SessionStatusResponse> onSuccess, Action<string> onError)
    {
        StartCoroutine(GetRequest($"{baseUrl}/api/vr/events/{eventId}/session-status", (json) =>
        {
            var response = JsonUtility.FromJson<SessionStatusResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>POST /api/vr/events/{eventId}/users/{userId}/heartbeat</summary>
    public void SendHeartbeat(string eventId, string userId, Action<HeartbeatResponse> onSuccess, Action<string> onError)
    {
        StartCoroutine(PostRequest($"{baseUrl}/api/vr/events/{eventId}/users/{userId}/heartbeat", "{}", (json) =>
        {
            var response = JsonUtility.FromJson<HeartbeatResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    /// <summary>POST /api/vr/debug/reset</summary>
    public void DebugReset(Action<GenericResponse> onSuccess, Action<string> onError)
    {
        StartCoroutine(PostRequest($"{baseUrl}/api/vr/debug/reset", "{}", (json) =>
        {
            var response = JsonUtility.FromJson<GenericResponse>(json);
            onSuccess?.Invoke(response);
        }, onError));
    }

    #endregion

    #region HTTP Helpers

    private IEnumerator GetRequest(string url, Action<string> onSuccess, Action<string> onError)
    {
        using (UnityWebRequest request = UnityWebRequest.Get(url))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
                onSuccess?.Invoke(request.downloadHandler.text);
            else
                onError?.Invoke($"{request.responseCode}: {request.error}");
        }
    }

    private IEnumerator PostRequest(string url, string jsonBody, Action<string> onSuccess, Action<string> onError)
    {
        using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
                onSuccess?.Invoke(request.downloadHandler.text);
            else
                onError?.Invoke($"{request.responseCode}: {request.error}");
        }
    }

    #endregion
}
