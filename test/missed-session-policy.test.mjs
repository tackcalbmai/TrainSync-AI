import test from "node:test";
import assert from "node:assert/strict";
import { assessMissedSessionMove, findMissedProgramSessions, missedSessionOptions, missedSessionResolutionAudit } from "../lib/missed-session-policy.mjs";

function session(id,date,key,primary,role="hypertrophy"){return{id,scheduled_date:date,status:"planned",title:id,payload:{exercises:[{exerciseKey:key,name:key,role,primaryMuscles:primary,sets:[{minReps:6,maxReps:8}]}]}};}

test("finds overdue planned/generated sessions but not completed work",()=>{const rows=[session("old","2026-08-26","barbell_back_squat",["quads"]),{...session("done","2026-08-25","barbell_bench_press",["chest"]),status:"completed"},session("future","2026-08-29","barbell_bench_press",["chest"])];assert.deepEqual(findMissedProgramSessions(rows,"2026-08-28").map(x=>x.id),["old"]);});

test("does not offer a move onto an existing training date",()=>{const missed=session("missed","2026-08-26","barbell_back_squat",["quads"]),other=session("next","2026-08-28","barbell_bench_press",["chest"]);const result=assessMissedSessionMove({missedSession:missed,candidateDate:"2026-08-28",sessions:[missed,other]});assert.equal(result.allowed,false);assert.equal(result.reasonCode,"SESSION_ALREADY_SCHEDULED_ON_DATE");});

test("blocks adjacent rescheduling with high primary-muscle overlap",()=>{const missed=session("missed","2026-08-26","barbell_bench_press",["chest","triceps"],"strength"),next=session("next","2026-08-29","dumbbell_bench_press",["chest","triceps"],"strength");const result=assessMissedSessionMove({missedSession:missed,candidateDate:"2026-08-28",sessions:[missed,next]});assert.equal(result.allowed,false);assert.equal(result.reasonCode,"ADJACENT_HIGH_PRIMARY_OVERLAP");});

test("allows adjacent non-overlapping upper/lower sessions with an explicit caution",()=>{const missed=session("missed","2026-08-26","barbell_back_squat",["quads","glutes"],"strength"),next=session("next","2026-08-29","barbell_bench_press",["chest","triceps"],"strength");const result=assessMissedSessionMove({missedSession:missed,candidateDate:"2026-08-28",sessions:[missed,next]});assert.equal(result.allowed,true);assert.ok(result.warnings.length>=1);});

test("automatic move options never cross the next scheduled session",()=>{const missed=session("missed","2026-08-25","barbell_back_squat",["quads"]),next=session("next","2026-08-30","barbell_bench_press",["chest"]);const result=missedSessionOptions({missedSession:missed,sessions:[missed,next],todayIso:"2026-08-28",maxSearchDays:4});assert.equal(result.missed,true);assert.ok(result.moveOptions.every(x=>x.candidateDate<"2026-08-30"));assert.equal(result.catchUpVolume,false);});

test("when there is no safe date before the next session, skip remains available without catch-up volume",()=>{const missed=session("missed","2026-08-26","barbell_bench_press",["chest"]),next=session("next","2026-08-28","dumbbell_bench_press",["chest"]);const result=missedSessionOptions({missedSession:missed,sessions:[missed,next],todayIso:"2026-08-28"});assert.equal(result.moveOptions.length,0);assert.equal(result.skipAllowed,true);assert.equal(result.catchUpVolume,false);assert.equal(result.reasonCode,"NO_SAFE_AUTOMATIC_MOVE_BEFORE_NEXT_SESSION");});

test("skip audit explicitly records no catch-up volume",()=>{const missed=session("missed","2026-08-26","barbell_back_squat",["quads"]);const audit=missedSessionResolutionAudit({missedSession:missed,action:"skip"});assert.equal(audit.reason_code,"MISSED_SESSION_SKIPPED");assert.equal(audit.metrics_snapshot.catchUpVolume,false);assert.equal(audit.decision_source,"user_confirmed");});

test("move audit stays a heuristic user-confirmed scheduling decision",()=>{const missed=session("missed","2026-08-26","barbell_back_squat",["quads"]),assessment={allowed:true,warnings:[]};const audit=missedSessionResolutionAudit({missedSession:missed,action:"move",movedTo:"2026-08-28",assessment});assert.equal(audit.reason_code,"MISSED_SESSION_MOVED");assert.equal(audit.evidence_level,"heuristic");assert.equal(audit.after_state.scheduledDate,"2026-08-28");});
