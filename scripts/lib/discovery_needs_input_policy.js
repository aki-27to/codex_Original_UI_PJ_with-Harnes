"use strict";

function safeString(value,maxLength=120){
  if(typeof value!=="string")return "";
  const normalized=value.trim();
  if(!normalized)return "";
  return normalized.slice(0,maxLength);
}

function toCount(value){
  if(!Number.isFinite(Number(value)))return 0;
  return Math.max(0,Math.trunc(Number(value)));
}

function toFlag(value){
  return value===true||value===1||value==="1";
}

function getPlanningSignals(planningContext){
  const context=planningContext&&typeof planningContext==="object"?planningContext:{};
  const selection=context.selection&&typeof context.selection==="object"?context.selection:{};
  const decision=context.planningDecisionContract&&typeof context.planningDecisionContract==="object"?context.planningDecisionContract:{};
  return{
    selection,
    requirement:context.requirementContract&&typeof context.requirementContract==="object"?context.requirementContract:{},
    selectionSignals:selection.signals&&typeof selection.signals==="object"?selection.signals:{},
    planningSignals:decision.planningSignals&&typeof decision.planningSignals==="object"?decision.planningSignals:{},
  };
}

function hasExplicitDiscoveryNeedsInputSignal(planningContext){
  const {requirement,selectionSignals,planningSignals}=getPlanningSignals(planningContext);
  const approvalBoundaryCount=Math.max(
    toCount(selectionSignals.approvalBoundaryCount),
    toCount(planningSignals.approvalBoundaryCount),
    Array.isArray(requirement.approvalBoundaryItems)?requirement.approvalBoundaryItems.length:0
  );
  return(
    toFlag(selectionSignals.explicitUserDecisionRequired)||
    toFlag(planningSignals.explicitUserDecisionRequired)||
    toFlag(selectionSignals.approvalBoundaryTouched)||
    toFlag(planningSignals.approvalBoundaryTouched)||
    approvalBoundaryCount>0
  );
}

function hasClarificationNeedsInputSignal(planningContext){
  const {selectionSignals,planningSignals}=getPlanningSignals(planningContext);
  const action=safeString(
    selectionSignals.clarificationAction||planningSignals.clarificationAction,
    40
  ).toLowerCase();
  return action==="ask_user_once"||action==="needs_input";
}

function shouldAutoInterruptForDiscoveryNeedsInput({planningDirective,planningContext,planningMode,observedSignals}={}){
  if(safeString(planningDirective,40).toUpperCase()==="NEEDS_INPUT"){
    return true;
  }
  const {selection}=getPlanningSignals(planningContext);
  if(!toFlag(selection.needsInputRecommended)){
    return false;
  }
  if(safeString(planningMode||selection.selectedMode,40).toUpperCase()!=="DISCOVERY"){
    return false;
  }
  const workSignals=observedSignals&&typeof observedSignals==="object"?observedSignals:{};
  if(toCount(workSignals.fileChanges)>0||toCount(workSignals.dispatchSuccessCount)>0){
    return false;
  }
  return hasExplicitDiscoveryNeedsInputSignal(planningContext)||hasClarificationNeedsInputSignal(planningContext);
}

module.exports={
  hasClarificationNeedsInputSignal,
  hasExplicitDiscoveryNeedsInputSignal,
  shouldAutoInterruptForDiscoveryNeedsInput,
};
