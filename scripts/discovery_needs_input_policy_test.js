#!/usr/bin/env node
"use strict";

const assert=require("assert");
const {
  hasClarificationNeedsInputSignal,
  hasExplicitDiscoveryNeedsInputSignal,
  shouldAutoInterruptForDiscoveryNeedsInput,
}=require("./lib/discovery_needs_input_policy");

function run(){
  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningDirective:"NEEDS_INPUT",
      planningMode:"NORMAL",
      planningContext:{},
      observedSignals:{fileChanges:1,dispatchSuccessCount:1},
    }),
    true,
    "explicit planning directive should always interrupt"
  );

  const heuristicOnlyContext={
    selection:{
      selectedMode:"DISCOVERY",
      needsInputRecommended:1,
      signals:{
        openQuestionsCount:1,
        userDecisionRequired:1,
        explicitUserDecisionRequired:0,
        approvalBoundaryTouched:0,
        approvalBoundaryCount:0,
      },
    },
    requirementContract:{
      approvalBoundaryItems:[],
    },
  };
  assert.strictEqual(
    hasExplicitDiscoveryNeedsInputSignal(heuristicOnlyContext),
    false,
    "heuristic open-question-only discovery should not look explicit"
  );
  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningDirective:"",
      planningMode:"DISCOVERY",
      planningContext:heuristicOnlyContext,
      observedSignals:{fileChanges:0,dispatchSuccessCount:0},
    }),
    false,
    "heuristic open-question-only discovery should not auto interrupt"
  );

  const clarificationContext={
    selection:{
      selectedMode:"DISCOVERY",
      needsInputRecommended:1,
      signals:{
        clarificationAction:"ask_user_once",
        clarificationQuestion:"この UI 改善で最優先したい方向は何ですか。",
      },
    },
  };
  assert.strictEqual(
    hasClarificationNeedsInputSignal(clarificationContext),
    true,
    "single-question clarification discovery should look like a needs-input signal"
  );
  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningDirective:"",
      planningMode:"DISCOVERY",
      planningContext:clarificationContext,
      observedSignals:{fileChanges:0,dispatchSuccessCount:0},
    }),
    true,
    "single-question clarification discovery should auto interrupt when no work was executed"
  );

  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningContext:{
        selection:{
          selectedMode:"DISCOVERY",
          needsInputRecommended:1,
          signals:{
            explicitUserDecisionRequired:1,
            approvalBoundaryCount:0,
          },
        },
      },
      planningMode:"DISCOVERY",
      observedSignals:{fileChanges:0,dispatchSuccessCount:0},
    }),
    true,
    "explicit user decision requirement should still auto interrupt"
  );

  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningContext:{
        selection:{
          selectedMode:"DISCOVERY",
          needsInputRecommended:1,
          signals:{
            explicitUserDecisionRequired:0,
            approvalBoundaryTouched:0,
            approvalBoundaryCount:0,
          },
        },
        planningDecisionContract:{
          planningSignals:{
            explicitUserDecisionRequired:0,
            approvalBoundaryCount:1,
          },
        },
        requirementContract:{
          approvalBoundaryItems:["cross-project config change"],
        },
      },
      planningMode:"DISCOVERY",
      observedSignals:{fileChanges:0,dispatchSuccessCount:0},
    }),
    false,
    "approval-boundary metadata alone should not auto interrupt"
  );

  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningContext:{
        selection:{
          selectedMode:"DISCOVERY",
          needsInputRecommended:1,
          signals:{
            explicitUserDecisionRequired:1,
          },
        },
      },
      planningMode:"DISCOVERY",
      observedSignals:{fileChanges:1,dispatchSuccessCount:0},
    }),
    false,
    "delivered file changes should suppress discovery auto interrupt fallback"
  );

  assert.strictEqual(
    shouldAutoInterruptForDiscoveryNeedsInput({
      planningContext:{
        selection:{
          selectedMode:"DISCOVERY",
          needsInputRecommended:1,
          signals:{
            explicitUserDecisionRequired:1,
          },
        },
      },
      planningMode:"DISCOVERY",
      observedSignals:{fileChanges:0,dispatchSuccessCount:1},
    }),
    false,
    "successful dispatch should suppress discovery auto interrupt fallback"
  );

  console.log("discovery_needs_input_policy_test: ok");
}

run();
