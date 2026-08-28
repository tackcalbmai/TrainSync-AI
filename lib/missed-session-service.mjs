import { findMissedProgramSessions, missedSessionOptions } from "./missed-session-policy.mjs";

const SUPABASE_URL="https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY="sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
function headers(token,extra={}){return{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...extra};}
async function parse(response){const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}if(!response.ok){const error=new Error(data?.message||data?.error||`Supabase request failed (${response.status})`);error.status=response.status;error.data=data;throw error;}return data;}
async function rest(token,path,options={}){return parse(await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:headers(token,options.headers||{}),signal:AbortSignal.timeout(12000)}));}
async function getProgramSession(token,userId,id){const q=new URLSearchParams({select:"id,user_id,program_id,week_index,day_index,slot_index,scheduled_date,title,status,workout_id,payload,rationale,revision,updated_at",id:`eq.${id}`,user_id:`eq.${userId}`,limit:"1"});const rows=await rest(token,`program_sessions?${q}`);return rows?.[0]||null;}
async function getProgramSessions(token,userId,programId){const q=new URLSearchParams({select:"id,user_id,program_id,week_index,day_index,slot_index,scheduled_date,title,status,workout_id,payload,rationale,revision,updated_at",user_id:`eq.${userId}`,program_id:`eq.${programId}`,order:"scheduled_date.asc,day_index.asc",limit:"100"});return rest(token,`program_sessions?${q}`);}
function cleanToday(value){const raw=String(value||"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;}

export async function missedSessionAction({token,userId,body={}}={}){
  if(!token||!userId)throw new Error("MISSED_SESSION_AUTH_REQUIRED");
  const todayIso=cleanToday(body.todayIso);if(!todayIso)return{statusCode:400,body:{error:"TODAY_ISO_REQUIRED"}};
  const sessionId=String(body.programSessionId||"").trim();if(!sessionId)return{statusCode:400,body:{error:"PROGRAM_SESSION_REQUIRED"}};
  const session=await getProgramSession(token,userId,sessionId).catch(()=>null);if(!session)return{statusCode:404,body:{error:"PROGRAM_SESSION_NOT_FOUND"}};
  const sessions=await getProgramSessions(token,userId,session.program_id);
  const missed=findMissedProgramSessions(sessions,todayIso).find((item)=>item.id===session.id);
  if(!missed)return{statusCode:409,body:{error:"PROGRAM_SESSION_NOT_MISSED"}};
  const options=missedSessionOptions({missedSession:missed,sessions,todayIso,maxSearchDays:3});
  if(body.action==="missed_session_options")return{statusCode:200,body:{session:missed,options}};
  if(body.action!=="resolve_missed_session")return{statusCode:400,body:{error:"MISSED_SESSION_ACTION_INVALID"}};
  const resolution=String(body.resolution||"");
  let newDate=null;
  if(resolution==="move"){
    newDate=cleanToday(body.candidateDate);
    const approved=options.moveOptions.find((item)=>item.candidateDate===newDate);
    if(!approved)return{statusCode:409,body:{error:"MISSED_SESSION_MOVE_NOT_APPROVED",options}};
  }else if(resolution!=="skip")return{statusCode:400,body:{error:"MISSED_SESSION_RESOLUTION_INVALID"}};
  const rows=await rest(token,"rpc/resolve_missed_program_session",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({p_program_session_id:session.id,p_action:resolution,p_today:todayIso,p_new_date:newDate})});
  const result=Array.isArray(rows)?rows[0]||null:rows;
  return{statusCode:200,body:{resolved:true,result,policyVersion:options.policyVersion,catchUpVolume:false}};
}
