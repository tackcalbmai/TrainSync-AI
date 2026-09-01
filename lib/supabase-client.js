import { parseSupabaseAuthFragment, cleanAuthFragmentUrl } from "./auth-redirect.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const SESSION_KEY = "trainsync:supabase-session";
function authHeaders(session, extra = {}) { return { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...extra }; }
async function parseResponse(response) { const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; } if (!response.ok) { const message = data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status})`; const error = new Error(message); error.status = response.status; error.data = data; throw error; } return data; }
export function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
function setSession(session) { if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); return session; }
function clearAuthFragment() { if (typeof window === "undefined" || !window.location?.hash) return; window.history.replaceState(null, "", cleanAuthFragmentUrl(window.location)); }
export async function getAuthUser(accessToken = null) {
  const token = accessToken || getSession()?.access_token;
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:authHeaders({ access_token:token }) });
  return parseResponse(response);
}
export async function consumeAuthRedirect(fragment = (typeof window !== "undefined" ? window.location.hash : "")) {
  const parsed = parseSupabaseAuthFragment(fragment);
  if (!parsed) return null;
  clearAuthFragment();
  if (parsed.error) { const error = new Error(parsed.errorDescription); error.code = parsed.errorCode; throw error; }
  const provisional = { access_token:parsed.accessToken, refresh_token:parsed.refreshToken, token_type:parsed.tokenType, ...(parsed.expiresIn ? { expires_in:parsed.expiresIn, expires_at:Math.floor(Date.now() / 1000) + parsed.expiresIn } : {}) };
  const user = await getAuthUser(parsed.accessToken);
  if (!user?.id) throw new Error("AUTH_REDIRECT_USER_INVALID");
  const session = setSession({ ...provisional, user });
  return { type:parsed.type, session };
}
export async function signUp(email, password) { const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method:"POST", headers:authHeaders(null), body:JSON.stringify({ email, password }) }); const data = await parseResponse(response); if (data?.access_token) setSession(data); return data; }
export async function signIn(email, password) { const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:authHeaders(null), body:JSON.stringify({ email, password }) }); return setSession(await parseResponse(response)); }
export async function requestPasswordReset(email, redirectTo) { const body = { email:String(email || "").trim() }; if (redirectTo) body.redirect_to=String(redirectTo); const response=await fetch(`${SUPABASE_URL}/auth/v1/recover`,{method:"POST",headers:authHeaders(null),body:JSON.stringify(body)}); return parseResponse(response); }
export async function updatePassword(password) { const session=getSession(); if(!session?.access_token) throw new Error("SIGN_IN_REQUIRED"); const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{method:"PUT",headers:authHeaders(session),body:JSON.stringify({password})}); const user=await parseResponse(response); if(user?.id) setSession({...session,user}); return user; }
export async function signOut() { const session=getSession(); if(session?.access_token){ try{ await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:"POST",headers:authHeaders(session)}); }catch{} } setSession(null); }
export async function refreshSession() { const current=getSession(); if(!current?.refresh_token) return null; const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:authHeaders(null),body:JSON.stringify({refresh_token:current.refresh_token})}); return setSession(await parseResponse(response)); }
export function currentUser() { return getSession()?.user || null; }
async function authorizedFetch(url, options={}) { let session=getSession(); if(!session?.access_token) throw new Error("SIGN_IN_REQUIRED"); let response=await fetch(url,{...options,headers:authHeaders(session,options.headers||{})}); if(response.status===401&&session.refresh_token){ session=await refreshSession(); response=await fetch(url,{...options,headers:authHeaders(session,options.headers||{})}); } return parseResponse(response); }
export async function deleteCurrentUser() { const result=await authorizedFetch(`${SUPABASE_URL}/functions/v1/delete-account`,{method:"POST",body:"{}"}); setSession(null); return result; }

export async function saveWorkout(workout) { const session=getSession(),userId=session?.user?.id; if(!userId) throw new Error("SIGN_IN_REQUIRED"); const row={user_id:userId,client_workout_id:workout.id,revision:workout.revision||1,title:workout.title,sport:workout.sport||"strength",scheduled_date:workout.scheduledDate,timezone:workout.timezone||"Europe/Riga",estimated_duration_minutes:workout.estimatedDurationMinutes,status:workout.status||"draft",payload:workout,updated_at:new Date().toISOString()}; const data=await authorizedFetch(`${SUPABASE_URL}/rest/v1/workouts?on_conflict=user_id,client_workout_id,revision`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)}); return Array.isArray(data)?data[0]:data; }
export async function listWorkouts(limit=12) { const query=new URLSearchParams({select:"id,client_workout_id,revision,title,scheduled_date,estimated_duration_minutes,status,payload,created_at,updated_at",order:"created_at.desc",limit:String(limit)}); return authorizedFetch(`${SUPABASE_URL}/rest/v1/workouts?${query}`); }
export async function updateWorkoutStatus(dbId,status,payload) { return authorizedFetch(`${SUPABASE_URL}/rest/v1/workouts?id=eq.${encodeURIComponent(dbId)}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status,payload,updated_at:new Date().toISOString()})}); }
export async function savePublication({workoutDbId,workout,result}) { const session=getSession(),userId=session?.user?.id; if(!userId) throw new Error("SIGN_IN_REQUIRED"); const row={user_id:userId,workout_id:workoutDbId,provider:result.provider||"garmin",idempotency_key:result.idempotencyKey,provider_resource_id:result.providerResourceId,status:result.success?"published":"failed",error_code:result.code||null,response_metadata:result}; const data=await authorizedFetch(`${SUPABASE_URL}/rest/v1/publication_attempts?on_conflict=user_id,idempotency_key`,{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(row)}); return Array.isArray(data)?data[0]:data; }
export async function getProfile() { const query=new URLSearchParams({select:"user_id,timezone,units,goal,experience_level,default_workout_minutes,equipment,created_at,updated_at",limit:"1"}); const data=await authorizedFetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?${query}`); return Array.isArray(data)?(data[0]||null):data; }
export async function saveProfile(profile) { const session=getSession(),userId=session?.user?.id; if(!userId) throw new Error("SIGN_IN_REQUIRED"); const row={user_id:userId,timezone:String(profile.timezone||"Europe/Riga").trim()||"Europe/Riga",units:profile.units==="imperial"?"imperial":"metric",goal:profile.goal||null,experience_level:profile.experience_level||null,default_workout_minutes:Math.max(15,Math.min(180,Number(profile.default_workout_minutes)||50)),equipment:Array.isArray(profile.equipment)?profile.equipment.filter(Boolean):[],updated_at:new Date().toISOString()}; const data=await authorizedFetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?on_conflict=user_id`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)}); return Array.isArray(data)?data[0]:data; }
function positiveInt(value,max=Number.MAX_SAFE_INTEGER){const n=Number(value);return Number.isInteger(n)&&n>0&&n<=max?n:null;}
function boundedRir(value){if(value===""||value==null)return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=6?n:null;}
function normalizeCompletedSet(set){const metricType=set?.metricType==="duration_seconds"?"duration_seconds":"reps";const reps=metricType==="reps"?positiveInt(set?.reps,500):null;const durationSeconds=metricType==="duration_seconds"?positiveInt(set?.durationSeconds,7200):null;if(metricType==="reps"&&reps==null)throw new Error("ACTUAL_REPS_INVALID");if(metricType==="duration_seconds"&&durationSeconds==null)throw new Error("ACTUAL_DURATION_INVALID");const weight=set?.weightKg===""||set?.weightKg==null?null:Number(set.weightKg);if(weight!=null&&(!Number.isFinite(weight)||weight<0))throw new Error("ACTUAL_WEIGHT_INVALID");const rir=set?.rir===""||set?.rir==null?null:boundedRir(set.rir);if(set?.rir!==""&&set?.rir!=null&&rir==null)throw new Error("ACTUAL_RIR_INVALID");const rpe=set?.rpe===""||set?.rpe==null?null:Number(set.rpe);if(rpe!=null&&(!Number.isFinite(rpe)||rpe<1||rpe>10))throw new Error("ACTUAL_RPE_INVALID");return{...set,metricType,reps,durationSeconds,targetReps:positiveInt(set?.targetReps,500),targetMinReps:positiveInt(set?.targetMinReps??set?.minReps,500),targetMaxReps:positiveInt(set?.targetMaxReps??set?.maxReps,500),targetDurationSeconds:positiveInt(set?.targetDurationSeconds,7200),targetMinDurationSeconds:positiveInt(set?.targetMinDurationSeconds??set?.minDurationSeconds,7200),targetMaxDurationSeconds:positiveInt(set?.targetMaxDurationSeconds??set?.maxDurationSeconds,7200),targetRir:boundedRir(set?.targetRir),rir,weightKg:weight,targetWeightKg:set?.targetWeightKg===""||set?.targetWeightKg==null?null:Number(set.targetWeightKg),rpe};}

export function createCompletionId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();throw new Error("SECURE_COMPLETION_ID_UNAVAILABLE");}
export function freeWorkoutCompletionPayload({completionId,workoutDbId,sets,startedAt,completedAt,durationSeconds=0,notes=""}={}){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(completionId||"")))throw new Error("COMPLETION_ID_REQUIRED");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(workoutDbId||"")))throw new Error("WORKOUT_SYNC_REQUIRED");
  const completedSets=(Array.isArray(sets)?sets:[]).map(normalizeCompletedSet);if(!completedSets.length)throw new Error("LOG_AT_LEAST_ONE_SET");if(completedSets.length>200)throw new Error("COMPLETED_SET_COUNT_INVALID");
  const finishedAt=completedAt||new Date().toISOString(),started=startedAt||finishedAt;
  if(!Number.isFinite(Date.parse(started))||!Number.isFinite(Date.parse(finishedAt))||Date.parse(finishedAt)<Date.parse(started))throw new Error("SESSION_TIME_INVALID");
  return{
    p_completion_key:completionId,
    p_workout_id:workoutDbId,
    p_started_at:started,
    p_completed_at:finishedAt,
    p_duration_seconds:Math.max(0,Math.min(86400,Math.round(Number(durationSeconds)||0))),
    p_notes:String(notes||""),
    p_actual_sets:completedSets.map((set)=>{const exerciseOrder=positiveInt(set.exerciseOrder,100),setIndex=positiveInt(set.setIndex,100);if(!exerciseOrder||!setIndex)throw new Error("SET_POSITION_INVALID");return{
      exerciseName:String(set.exerciseName||"Exercise").trim(),exerciseKey:String(set.exerciseKey||"").trim()||null,
      exerciseOrder,setIndex,metricType:set.metricType,
      reps:set.metricType==="reps"?set.reps:null,durationSeconds:set.metricType==="duration_seconds"?set.durationSeconds:null,
      weightKg:set.weightKg,rpe:set.rpe,rir:set.rir,isWarmup:Boolean(set.isWarmup),
    }}),
  };
}
export async function completeWorkoutSession(args={}){
  if(!getSession()?.user?.id)throw new Error("SIGN_IN_REQUIRED");
  const payload=freeWorkoutCompletionPayload(args);
  const rows=await authorizedFetch(`${SUPABASE_URL}/rest/v1/rpc/complete_workout_session`,{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(payload)});
  const completed=Array.isArray(rows)?rows[0]:rows;if(!completed?.workout_session_id)throw new Error("SESSION_COMPLETION_FAILED");
  return{workoutSessionId:completed.workout_session_id,duplicate:Boolean(completed.duplicate),session:{id:completed.workout_session_id},setResults:payload.p_actual_sets};
}

const SET_SELECT="id,session_id,exercise_name,exercise_key,planned_exercise_key,exercise_order,set_index,metric_type,target_reps,target_min_reps,target_max_reps,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,target_weight_kg,target_rir,reps,duration_seconds,weight_kg,rpe,rir,is_warmup,completed_at,created_at";
export async function listWorkoutSessions(limit=100){const query=new URLSearchParams({select:"id,workout_id,title,started_at,completed_at,duration_seconds,status,notes,total_sets,total_volume_kg,source,created_at,updated_at",order:"completed_at.desc.nullslast,created_at.desc",limit:String(Math.max(1,Math.min(500,Number(limit)||100)))});return authorizedFetch(`${SUPABASE_URL}/rest/v1/workout_sessions?${query}`);}
export async function listSetResults(limit=2500){const query=new URLSearchParams({select:SET_SELECT,order:"completed_at.desc,exercise_order.asc,set_index.asc",limit:String(Math.max(1,Math.min(5000,Number(limit)||2500)))});return authorizedFetch(`${SUPABASE_URL}/rest/v1/set_results?${query}`);}
export async function listSessionSets(sessionId){const query=new URLSearchParams({select:SET_SELECT,session_id:`eq.${sessionId}`,order:"exercise_order.asc,set_index.asc"});return authorizedFetch(`${SUPABASE_URL}/rest/v1/set_results?${query}`);}
export { SUPABASE_URL };
