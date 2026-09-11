/*
  Exhibition Platform — V14.1.1 Scene Loading Policies / V14.1.10 No-Reload Residency & Frame-Time Closure
  Pure lifecycle/loading policy contract. No DOM, Babylon, Supabase or mutable globals.
*/

export const SCENE_LOADING_POLICY_SCHEMA = "exhibition-platform-scene-loading-policy.v1";
export const SCENE_LOADING_READINESS_EVENT = "gallery-scene-readiness";
export const SCENE_LOADING_READINESS_PHASE = "scene-visually-settled";

export const SCENE_LOADING_CONTEXTS = Object.freeze({
  PUBLIC_EXHIBITION: "public-exhibition",
  ADMIN_EXHIBITION: "admin-exhibition",
  GALLERY_AUTHORING: "gallery-authoring",
  TEST_GALLERY: "test-gallery"
});

export const SCENE_LOADING_SPACE_ROLES = Object.freeze(["floor", "walls", "ceiling", "props"]);
export const SCENE_LOADING_VISIBLE_FAMILIES = Object.freeze([
  "artwork-preview",
  "frames",
  "sculpture-models",
  "shared-props"
]);

const CONTEXT_ALIASES = Object.freeze({
  public: SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION,
  viewer: SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION,
  "public-viewer": SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION,
  exhibition: SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION,
  "public-exhibition": SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION,
  admin: SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION,
  editor: SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION,
  "admin-workspace": SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION,
  "admin-exhibition": SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION,
  authoring: SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING,
  gallery: SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING,
  "gallery-preview": SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING,
  "gallery-authoring": SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING,
  test: SCENE_LOADING_CONTEXTS.TEST_GALLERY,
  "test-preview": SCENE_LOADING_CONTEXTS.TEST_GALLERY,
  "test-gallery": SCENE_LOADING_CONTEXTS.TEST_GALLERY
});

const REQUIRED_EXHIBITION_SPACE_ROLES = Object.freeze(new Set(["floor", "walls", "ceiling"]));

function text(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function freezeRecord(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => freezeRecord(value[key]));
  return Object.freeze(value);
}

export function normalizeSceneLoadingContext(value, fallback = SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION) {
  const normalized = text(value);
  if (CONTEXT_ALIASES[normalized]) return CONTEXT_ALIASES[normalized];
  const fallbackNormalized = text(fallback);
  return CONTEXT_ALIASES[fallbackNormalized] || SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION;
}

export function resolveSceneLoadingContextFromRuntimeOptions(runtimeOptions = {}) {
  const options = runtimeOptions && typeof runtimeOptions === "object" ? runtimeOptions : {};
  const explicitPolicyContext = options.loadingPolicy && typeof options.loadingPolicy === "object"
    ? options.loadingPolicy.contextKind
    : "";
  const explicitContext = options.loadingContext || options.contextKind || explicitPolicyContext;
  if (text(explicitContext)) return normalizeSceneLoadingContext(explicitContext);
  if (options.authoringSpacePreview === true) return SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING;
  if (options.galleryTestMode === true) return SCENE_LOADING_CONTEXTS.TEST_GALLERY;
  if (options.adminWorkspace === true) return SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION;
  return SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION;
}

function createSpaceRolePolicy(contextKind, role) {
  const normalizedRole = text(role);
  const strictSpaceContext = contextKind !== SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING;
  const authoringOrTestPreview = contextKind === SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING
    || contextKind === SCENE_LOADING_CONTEXTS.TEST_GALLERY;
  const requiredForValidRuntime = strictSpaceContext && REQUIRED_EXHIBITION_SPACE_ROLES.has(normalizedRole);
  const isExhibitionRuntime = contextKind === SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION
    || contextKind === SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION;
  // V14.1.9: Props stay optional at the schema level, but once a Public/Admin Gallery Version
  // assigns Props they are part of the walkthrough scene and must settle before interaction.
  const assignedMustSettleBeforePreview = authoringOrTestPreview
    || requiredForValidRuntime
    || (isExhibitionRuntime && normalizedRole === "props");
  return freezeRecord({
    role: normalizedRole,
    requiredForValidRuntime,
    assignmentOptional: !requiredForValidRuntime,
    assignedMustSettleBeforePreview,
    unassignedIsLegal: !requiredForValidRuntime,
    failureMustBeExplicitBeforePreview: assignedMustSettleBeforePreview
  });
}

function createFamilyPolicy(contextKind, family) {
  const normalizedFamily = text(family);
  const isPublic = contextKind === SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION;
  const isAdmin = contextKind === SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION;
  const isAuthoring = contextKind === SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING;
  const isTest = contextKind === SCENE_LOADING_CONTEXTS.TEST_GALLERY;

  if (normalizedFamily === "artwork-preview") {
    return freezeRecord({ family: normalizedFamily, mode: isPublic || isAdmin ? "foreground" : "not-applicable", blocksPreviewSettle: isPublic || isAdmin });
  }
  if (["frames", "sculpture-models", "shared-props"].includes(normalizedFamily)) {
    const walkthroughTerminal = isPublic || isAdmin;
    return freezeRecord({
      family: normalizedFamily,
      mode: walkthroughTerminal ? "foreground-terminal" : "not-applicable",
      blocksPreviewSettle: walkthroughTerminal,
      explicitUnavailableCountsAsTerminal: walkthroughTerminal
    });
  }
  return freezeRecord({
    family: normalizedFamily,
    mode: isAuthoring || isTest ? "not-applicable" : "background",
    blocksPreviewSettle: false
  });
}

function createReadinessContract(contextKind) {
  const map = {
    [SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION]: {
      interactionPhase: "interaction-ready",
      previewPhase: "walkthrough-visible-settled",
      terminalVisiblePhase: "walkthrough-visible-settled",
      backgroundAllowedAfterPreview: true
    },
    [SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION]: {
      interactionPhase: "interaction-ready",
      previewPhase: "walkthrough-visible-settled",
      terminalVisiblePhase: "walkthrough-visible-settled",
      backgroundAllowedAfterPreview: true
    },
    [SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING]: {
      interactionPhase: "interaction-ready",
      previewPhase: "authoring-preview-settled",
      terminalVisiblePhase: "authoring-preview-settled",
      backgroundAllowedAfterPreview: true
    },
    [SCENE_LOADING_CONTEXTS.TEST_GALLERY]: {
      interactionPhase: "interaction-ready",
      previewPhase: "test-preview-settled",
      terminalVisiblePhase: "test-preview-settled",
      backgroundAllowedAfterPreview: true
    }
  };
  return freezeRecord({
    authorityEvent: SCENE_LOADING_READINESS_EVENT,
    authorityPhase: SCENE_LOADING_READINESS_PHASE,
    compatibilityReadyEvent: "gallery-interaction-ready",
    failureEvent: "gallery-startup-failure",
    ...map[contextKind]
  });
}

export function createSceneLoadingPolicy(contextValue) {
  const contextKind = normalizeSceneLoadingContext(contextValue);
  const spaceRoles = {};
  SCENE_LOADING_SPACE_ROLES.forEach((role) => { spaceRoles[role] = createSpaceRolePolicy(contextKind, role); });
  const visibleFamilies = {};
  SCENE_LOADING_VISIBLE_FAMILIES.forEach((family) => { visibleFamilies[family] = createFamilyPolicy(contextKind, family); });

  const isAuthoring = contextKind === SCENE_LOADING_CONTEXTS.GALLERY_AUTHORING;
  const isTest = contextKind === SCENE_LOADING_CONTEXTS.TEST_GALLERY;
  return freezeRecord({
    schema: SCENE_LOADING_POLICY_SCHEMA,
    contextKind,
    sceneReuse: {
      allowSameVenueVersionSceneReuse: !isAuthoring && !isTest,
      isolateFromExhibitionRuntime: isAuthoring || isTest
    },
    spaceRoles,
    readiness: createReadinessContract(contextKind),
    visibleFamilies,
    compatibility: {
      authoringSpacePreview: isAuthoring,
      adminWorkspace: contextKind === SCENE_LOADING_CONTEXTS.ADMIN_EXHIBITION,
      publicViewerOnly: contextKind === SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION || isTest,
      galleryTestMode: isTest
    }
  });
}

export function resolveSceneLoadingPolicyFromRuntimeOptions(runtimeOptions = {}) {
  const options = runtimeOptions && typeof runtimeOptions === "object" ? runtimeOptions : {};
  const explicit = options.loadingPolicy;
  const contextKind = explicit && typeof explicit === "object" && explicit.schema === SCENE_LOADING_POLICY_SCHEMA
    ? explicit.contextKind
    : resolveSceneLoadingContextFromRuntimeOptions(options);
  return createSceneLoadingPolicy(contextKind);
}

export function canReuseSameVenueVersionScene(policyOrContext) {
  const policy = policyOrContext && typeof policyOrContext === "object" && policyOrContext.schema === SCENE_LOADING_POLICY_SCHEMA
    ? policyOrContext
    : createSceneLoadingPolicy(policyOrContext);
  return policy.sceneReuse.allowSameVenueVersionSceneReuse === true;
}

export function getSceneLoadingSpaceRolePolicy(policyOrContext, role, options = {}) {
  const policy = policyOrContext && typeof policyOrContext === "object" && policyOrContext.schema === SCENE_LOADING_POLICY_SCHEMA
    ? policyOrContext
    : createSceneLoadingPolicy(policyOrContext);
  const normalizedRole = text(role);
  const base = policy.spaceRoles[normalizedRole] || createSpaceRolePolicy(policy.contextKind, normalizedRole);
  const assigned = options.assigned !== false;
  return freezeRecord({
    ...base,
    assigned,
    createsTask: assigned,
    mustSettleBeforePreview: assigned && base.assignedMustSettleBeforePreview === true
  });
}

export function getSceneLoadingReadinessContract(policyOrContext) {
  const policy = policyOrContext && typeof policyOrContext === "object" && policyOrContext.schema === SCENE_LOADING_POLICY_SCHEMA
    ? policyOrContext
    : createSceneLoadingPolicy(policyOrContext);
  return policy.readiness;
}

export function getSceneLoadingFamilyPolicy(policyOrContext, family) {
  const policy = policyOrContext && typeof policyOrContext === "object" && policyOrContext.schema === SCENE_LOADING_POLICY_SCHEMA
    ? policyOrContext
    : createSceneLoadingPolicy(policyOrContext);
  const normalizedFamily = text(family);
  return policy.visibleFamilies[normalizedFamily] || createFamilyPolicy(policy.contextKind, normalizedFamily);
}

export function getLegacySceneModeFlags(policyOrContext) {
  const policy = policyOrContext && typeof policyOrContext === "object" && policyOrContext.schema === SCENE_LOADING_POLICY_SCHEMA
    ? policyOrContext
    : createSceneLoadingPolicy(policyOrContext);
  return policy.compatibility;
}
