import test from "node:test";
import assert from "node:assert/strict";
import { buildNextSessionInsight, latestExerciseExposure, latestRelevantAdjustment } from "../lib/next-session-insight.mjs";

const exercise={exerciseKey:"barbell_bench_press",sets:[{metricType:"reps",minReps:6,maxReps:8,targetReps:null,weightKg:82.5,targetRir:2},{metricType:"reps",minReps:6,maxReps:8,targetReps:null,weightKg:82.5,targetRir:2},{metricType:"reps",minReps:6,maxReps:8,targetReps:null,weightKg:82.5,targetRir:2}]};
const rows=[
  {session_id:"old",exercise_key:"barbell_bench_press",set_index:1,reps:7,weight_kg:77.5,rir:3,completed_at:"2026-08-20T10:00:00Z"},
  {session_id:"new",exercise_key:"barbell_bench_press",set_index:1,reps:8,weight_kg:80,rir:2,completed_at:"2026-08-27T10:00:00Z"},
  {session_id:"new",exercise_key:"barbell_bench_press",set_index:2,reps:8,weight_kg:80,rir:2,completed_at:"2026-08-27T10:00:00Z"},
  {session_id:"new",exercise_key:"barbell_bench_press",set_index:3,reps:8,weight_kg:80,rir:2,completed_at:"2026-08-27T10:00:00Z"},
];

test("uses the latest exposure for the same canonical exercise",()=>{const exposure=latestExerciseExposure(rows,"barbell_bench_press");assert.equal(exposure.sessionId,"new");assert.equal(exposure.rows.length,3);});

test("filters adjustments to the actual upcoming program session",()=>{const adjustments=[{id:"wrong",target_key:"barbell_bench_press",program_session_id:"other",created_at:"2026-08-28T09:00:00Z"},{id:"right",target_key:"barbell_bench_press",program_session_id:"target",created_at:"2026-08-28T08:00:00Z"}];assert.equal(latestRelevantAdjustment(adjustments,"barbell_bench_press","target").id,"right");});

test("renders last performance, today's prescription and deterministic reason",()=>{const insight=buildNextSessionInsight({exercise,setResults:rows,programSessionId:"target",adjustments:[{id:"a1",target_key:"barbell_bench_press",program_session_id:"target",adjustment_type:"progress_load",reason_code:"REPEATED_OVERPERFORMANCE",created_at:"2026-08-28T08:00:00Z"}]});assert.match(insight.text,/LAST 80 KG × 8,8,8 · RIR 2/);assert.match(insight.text,/TODAY 82.5 KG × 6–8 REPS · RIR 2/);assert.match(insight.text,/PROGRESSED AFTER REPEATED SUCCESS/);});

test("does not infer RIR from RPE when direct RIR is absent",()=>{const rpeRows=rows.filter(row=>row.session_id==="new").map(({rir,...row})=>({...row,rpe:8}));const insight=buildNextSessionInsight({exercise,setResults:rpeRows});assert.match(insight.text,/RPE 8/);assert.doesNotMatch(insight.text,/RIR 2 →/);});

test("shows first recorded exposure rather than inventing history",()=>{const insight=buildNextSessionInsight({exercise,setResults:[],adjustments:[]});assert.equal(insight.last,null);assert.match(insight.text,/FIRST RECORDED EXPOSURE/);});

test("uses imperial display without changing canonical stored kilograms",()=>{const insight=buildNextSessionInsight({exercise,setResults:rows.filter(row=>row.session_id==="new"),units:"imperial"});assert.match(insight.text,/176.4 LB/);assert.match(insight.text,/181.9 LB/);});
