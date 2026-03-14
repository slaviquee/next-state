import { ai } from "../../gemini.js";
import { buildStructuringPrompt } from "../prompts/structuring.js";
import { CompiledScenePackageSchema } from "@next-state/shared";
import type { CompiledScenePackage } from "@next-state/shared";
import {
  StructuringInterpretationOutputSchema,
  type VideoAnalysisOutput,
  type StyleExtractionOutput,
} from "../schemas.js";

const MODEL = "gemini-3.1-flash-lite-preview";
const MAX_RETRIES = 3;

const DEFAULT_OBJECT_SCALES: Record<string, { x: number; y: number; z: number }> = {
  table: { x: 1.2, y: 0.75, z: 0.8 },
  chair: { x: 0.5, y: 0.85, z: 0.5 },
  desk: { x: 1.4, y: 0.75, z: 0.7 },
  counter: { x: 2.0, y: 1.0, z: 0.6 },
  sofa: { x: 1.8, y: 0.8, z: 0.8 },
  laptop: { x: 0.35, y: 0.04, z: 0.25 },
  coffee_machine: { x: 0.4, y: 0.5, z: 0.35 },
  screen: { x: 0.6, y: 0.4, z: 0.05 },
  plant: { x: 0.3, y: 0.6, z: 0.3 },
  door: { x: 0.9, y: 2.0, z: 0.15 },
  wall: { x: 1.0, y: 3.0, z: 0.15 },
  bookshelf: { x: 0.8, y: 1.8, z: 0.35 },
  whiteboard: { x: 1.8, y: 1.2, z: 0.05 },
  window: { x: 1.5, y: 1.5, z: 0.1 },
  rug: { x: 2.0, y: 0.02, z: 1.5 },
  trash_can: { x: 0.3, y: 0.6, z: 0.3 },
  light_fixture: { x: 0.5, y: 0.1, z: 0.5 },
  stool: { x: 0.35, y: 0.65, z: 0.35 },
  cabinet: { x: 0.6, y: 0.9, z: 0.5 },
  unknown: { x: 0.5, y: 0.5, z: 0.5 },
};

type JsonRecord = Record<string, unknown>;
type PolygonModel = CompiledScenePackage["environment"]["floorPlan"];
type SceneObjectModel = CompiledScenePackage["environment"]["objects"][number];
type SemanticZoneModel = CompiledScenePackage["environment"]["semanticZones"][number];
type PortalModel = CompiledScenePackage["environment"]["entrances"][number];
type NavNodeModel = CompiledScenePackage["environment"]["navigationGraph"]["nodes"][number];
type NavEdgeModel = CompiledScenePackage["environment"]["navigationGraph"]["edges"][number];
type AgentModel = CompiledScenePackage["agents"][number];
type AgentGoalModel = AgentModel["mind"]["primaryGoal"];
type LikelyActionModel = AgentModel["mind"]["likelyNextActions"][number];
type RecentEventModel = AgentModel["runtime"]["recentEvents"][number];

const SPACE_TYPES = ["cafe", "office", "meeting_room", "corridor", "classroom", "lobby", "unknown"] as const;
const LOCATION_TYPES = ["indoor", "outdoor", "semi_outdoor"] as const;
const TIME_OF_DAYS = ["morning", "midday", "afternoon", "evening", "night"] as const;
const DAY_TYPES = ["weekday", "weekend", "unknown"] as const;
const SEASONS = ["spring", "summer", "autumn", "winter", "unknown"] as const;
const CROWD_DENSITIES = ["sparse", "moderate", "dense"] as const;
const PORTAL_TYPES = ["door", "opening", "corridor_end", "unknown"] as const;
const ZONE_TYPES = ["seating", "standing", "service", "circulation", "entry", "exit", "waiting", "unknown"] as const;
const GENDERS = ["male", "female", "ambiguous"] as const;
const AGE_GROUPS = ["child", "young_adult", "adult", "middle_aged", "elderly"] as const;
const BODY_TYPES = ["small", "medium", "large"] as const;
const HEIGHT_BUCKETS = ["short", "average", "tall"] as const;
const POSES = ["standing", "sitting", "walking"] as const;
const CLOTHING_STYLES = ["casual", "business", "uniform", "athletic", "formal"] as const;
const LIGHTING_MOODS = ["neutral", "warm", "cool", "dim", "bright"] as const;
const ARCHETYPES = [
  "waiting_guest",
  "staff",
  "seated_worker",
  "late_arrival",
  "person_leaving",
  "social_group_member",
  "uncertain_visitor",
  "unknown",
] as const;
const GOAL_TYPES = [
  "stay_put",
  "find_seat",
  "follow_companion",
  "approach_counter",
  "move_to_exit",
  "wait_for_someone",
  "wander",
  "reposition",
  "avoid_crowd",
] as const;
const REACTION_STYLES = ["calm", "hesitant", "follow_others", "goal_directed", "anxious"] as const;
const ANIMATION_STATES = ["idle", "walk", "sit", "turn", "wait", "react", "talk", "glance", "fidget"] as const;
const RELATIONSHIPS = ["friend", "coworker", "staff-customer", "stranger", "unknown"] as const;
const HAIR_LENGTHS = ["short", "medium", "long"] as const;
const OBJECT_MATERIALS = ["wood", "metal", "plastic", "fabric", "glass", "stone", "unknown"] as const;
const OBJECT_SHAPES = ["rectangular", "round", "oval", "L_shaped", "irregular", "unknown"] as const;
const LIGHTING_DIRECTIONS = ["overhead", "left", "right", "front", "back", "diffuse"] as const;
const FLOOR_MATERIALS = ["wood", "tile", "carpet", "concrete", "stone", "unknown"] as const;
const WALL_MATERIALS = ["painted", "brick", "wood_panel", "glass", "concrete", "unknown"] as const;
const DEPTH_HINTS = ["near", "mid", "far"] as const;
const PROJECTION_SOURCES = ["gemini_3d", "heuristic_2d"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function toAgentId(personIndex: number): string {
  return `a${String(personIndex + 1).padStart(2, "0")}`;
}

function projectBoxToPosition(
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
  bounds: { width: number; depth: number; height: number },
  y = 0,
): { x: number; y: number; z: number } {
  const cx = (box.xMin + box.xMax) / 2000;
  const cy = (box.yMin + box.yMax) / 2000;

  return {
    x: clamp(cx * bounds.width, 0.25, Math.max(0.25, bounds.width - 0.25)),
    y,
    z: clamp(cy * bounds.depth, 0.25, Math.max(0.25, bounds.depth - 0.25)),
  };
}

function projectBoxToPolygon(
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
  bounds: { width: number; depth: number },
): { points: { x: number; z: number }[] } {
  const x1 = clamp((box.xMin / 1000) * bounds.width, 0, bounds.width);
  const x2 = clamp((box.xMax / 1000) * bounds.width, 0, bounds.width);
  const z1 = clamp((box.yMin / 1000) * bounds.depth, 0, bounds.depth);
  const z2 = clamp((box.yMax / 1000) * bounds.depth, 0, bounds.depth);

  return {
    points: [
      { x: Math.min(x1, x2), z: Math.min(z1, z2) },
      { x: Math.max(x1, x2), z: Math.min(z1, z2) },
      { x: Math.max(x1, x2), z: Math.max(z1, z2) },
      { x: Math.min(x1, x2), z: Math.max(z1, z2) },
    ],
  };
}

function polygonCentroid(polygon: { points: { x: number; z: number }[] }): { x: number; z: number } {
  if (polygon.points.length === 0) {
    return { x: 0, z: 0 };
  }

  let x = 0;
  let z = 0;
  for (const point of polygon.points) {
    x += point.x;
    z += point.z;
  }

  return {
    x: x / polygon.points.length,
    z: z / polygon.points.length,
  };
}

function normalizeObjectType(label: string): CompiledScenePackage["environment"]["objects"][number]["type"] {
  const value = label.toLowerCase();
  if (value in DEFAULT_OBJECT_SCALES) {
    return value as CompiledScenePackage["environment"]["objects"][number]["type"];
  }
  return "unknown";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? (value as T[number]) : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNulls(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) {
      continue;
    }
    next[key] = stripNulls(entry);
  }
  return next;
}

function findCandidateByIdOrIndex(rawItems: unknown[], fallbackId: string, index: number): unknown {
  const byId = rawItems.find((entry) => isRecord(entry) && entry.id === fallbackId);
  return byId ?? rawItems[index];
}

function normalizePoint2D(
  value: unknown,
  fallback?: { x: number; z: number },
): { x: number; z: number } | null {
  if (!isRecord(value)) {
    return fallback ? { ...fallback } : null;
  }

  const x = asFiniteNumber(value.x);
  const z = asFiniteNumber(value.z);
  if (x === undefined || z === undefined) {
    return fallback ? { ...fallback } : null;
  }

  return { x, z };
}

function normalizePolygon(
  value: unknown,
  fallback: PolygonModel,
): PolygonModel {
  const rawPoints =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.points)
        ? value.points
        : null;

  if (!rawPoints) {
    return structuredClone(fallback);
  }

  const points = rawPoints
    .map((entry) => normalizePoint2D(entry))
    .filter((entry): entry is { x: number; z: number } => entry !== null);

  return points.length >= 3 ? { points } : structuredClone(fallback);
}

function normalizeVec3(
  value: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    x: asFiniteNumber(value.x) ?? fallback.x,
    y: asFiniteNumber(value.y) ?? fallback.y,
    z: asFiniteNumber(value.z) ?? fallback.z,
  };
}

function normalizeBoundingBox(
  value: unknown,
  fallback: { xMin: number; xMax: number; yMin: number; yMax: number },
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    xMin: asFiniteNumber(value.xMin) ?? fallback.xMin,
    xMax: asFiniteNumber(value.xMax) ?? fallback.xMax,
    yMin: asFiniteNumber(value.yMin) ?? fallback.yMin,
    yMax: asFiniteNumber(value.yMax) ?? fallback.yMax,
  };
}

function normalizeSpatialEstimate(
  value: unknown,
  fallback: AgentModel["visual"]["spatialEstimate"],
  positionFallback: { x: number; y: number; z: number },
): AgentModel["visual"]["spatialEstimate"] {
  const estimate = structuredClone(fallback);

  if (!isRecord(value)) {
    estimate.position3d = { ...positionFallback };
    return estimate;
  }

  estimate.position3d = normalizeVec3(value.position3d, positionFallback);

  const confidence3d = asFiniteNumber(value.confidence3d);
  if (confidence3d !== undefined) {
    estimate.confidence3d = clamp(confidence3d, 0, 1);
  }

  const projectionSource = asEnum(value.projectionSource, PROJECTION_SOURCES);
  if (projectionSource) {
    estimate.projectionSource = projectionSource;
  }

  estimate.videoBoundingBox = normalizeBoundingBox(value.videoBoundingBox, estimate.videoBoundingBox);

  const depthHint = asEnum(value.depthHint, DEPTH_HINTS);
  if (depthHint) {
    estimate.depthHint = depthHint;
  }

  return estimate;
}

function normalizeLikelyNextActions(
  value: unknown,
  fallback: AgentModel["mind"]["likelyNextActions"],
): AgentModel["mind"]["likelyNextActions"] {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }

  const entries = value.flatMap((entry) => {
    if (typeof entry === "string" && entry.length > 0) {
      return [{ label: entry, weight: 1 }];
    }

    if (!isRecord(entry)) {
      return [];
    }

    const label = asString(entry.label) ?? asString(entry.action) ?? asString(entry.text);
    if (!label) {
      return [];
    }

    return [{
      label,
      weight: Math.max(asFiniteNumber(entry.probability) ?? asFiniteNumber(entry.weight) ?? 1, 0.01),
    }];
  });

  if (entries.length === 0) {
    return structuredClone(fallback);
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return entries.map((entry): LikelyActionModel => ({
    label: entry.label,
    probability: entry.weight / total,
  }));
}

function normalizeGoal(
  value: unknown,
  fallback: AgentGoalModel,
): AgentGoalModel {
  const goal = structuredClone(fallback);

  if (!isRecord(value)) {
    return goal;
  }

  const type = asEnum(value.type, GOAL_TYPES);
  if (type) {
    goal.type = type;
  }

  const targetZoneId = asString(value.targetZoneId);
  if (targetZoneId) {
    goal.targetZoneId = targetZoneId;
  } else if (value.targetZoneId === null) {
    delete goal.targetZoneId;
  }

  const targetObjectId = asString(value.targetObjectId);
  if (targetObjectId) {
    goal.targetObjectId = targetObjectId;
  } else if (value.targetObjectId === null) {
    delete goal.targetObjectId;
  }

  const targetAgentId = asString(value.targetAgentId);
  if (targetAgentId) {
    goal.targetAgentId = targetAgentId;
  } else if (value.targetAgentId === null) {
    delete goal.targetAgentId;
  }

  const urgency = asFiniteNumber(value.urgency);
  if (urgency !== undefined) {
    goal.urgency = clamp(urgency, 0, 1);
  }

  const ttlSec = asFiniteNumber(value.ttlSec);
  if (ttlSec !== undefined) {
    goal.ttlSec = Math.max(1, ttlSec);
  }

  return goal;
}

function normalizeSceneObject(
  value: unknown,
  fallback: SceneObjectModel,
): SceneObjectModel {
  const object = structuredClone(fallback);

  if (!isRecord(value)) {
    return object;
  }

  const rawType = asString(value.type);
  if (rawType) {
    const normalizedType = normalizeObjectType(rawType);
    if (normalizedType !== "unknown" || rawType.toLowerCase() === "unknown") {
      object.type = normalizedType;
    }
  }

  const position = normalizeVec3(value.position, object.position);
  object.position = position;

  const rotationY = asFiniteNumber(value.rotationY);
  if (rotationY !== undefined) {
    object.rotationY = rotationY;
  }

  object.scale = normalizeVec3(value.scale, object.scale);

  const interactable = asBoolean(value.interactable);
  if (interactable !== undefined) {
    object.interactable = interactable;
  }

  const blocksMovement = asBoolean(value.blocksMovement);
  if (blocksMovement !== undefined) {
    object.blocksMovement = blocksMovement;
  }

  if (typeof value.occupiedByAgentId === "string") {
    object.occupiedByAgentId = value.occupiedByAgentId;
  } else if (value.occupiedByAgentId === null) {
    object.occupiedByAgentId = null;
  }

  if (isRecord(value.styleHints)) {
    object.styleHints = {
      primaryColor: asString(value.styleHints.primaryColor) ?? object.styleHints?.primaryColor,
      secondaryColor: asString(value.styleHints.secondaryColor) ?? object.styleHints?.secondaryColor,
      material: asEnum(value.styleHints.material, OBJECT_MATERIALS) ?? object.styleHints?.material,
      shape: asEnum(value.styleHints.shape, OBJECT_SHAPES) ?? object.styleHints?.shape,
    };
  }

  if (object.spatialEstimate) {
    object.spatialEstimate = normalizeSpatialEstimate(
      value.spatialEstimate,
      object.spatialEstimate,
      position,
    );
    object.spatialEstimate.position3d = { ...position };
  }

  return object;
}

function normalizeSemanticZone(
  value: unknown,
  fallback: SemanticZoneModel,
): SemanticZoneModel {
  const zone = structuredClone(fallback);

  if (!isRecord(value)) {
    return zone;
  }

  const type = asEnum(value.type, ZONE_TYPES);
  if (type) {
    zone.type = type;
  }

  zone.polygon = normalizePolygon(value.polygon, zone.polygon);

  const attractivenessWeight = asFiniteNumber(value.attractivenessWeight);
  if (attractivenessWeight !== undefined) {
    zone.attractivenessWeight = attractivenessWeight;
  }

  const capacity = asFiniteNumber(value.capacity);
  if (capacity !== undefined) {
    zone.capacity = capacity;
  } else if (value.capacity === null) {
    delete zone.capacity;
  }

  zone.occupantIds = asStringArray(value.occupantIds) ?? zone.occupantIds;
  zone.queueIds = asStringArray(value.queueIds) ?? zone.queueIds;

  return zone;
}

function normalizePortal(
  value: unknown,
  fallback: PortalModel,
): PortalModel {
  const portal = structuredClone(fallback);

  if (!isRecord(value)) {
    return portal;
  }

  portal.position = normalizeVec3(value.position, portal.position);

  const facingAngle = asFiniteNumber(value.facingAngle);
  if (facingAngle !== undefined) {
    portal.facingAngle = facingAngle;
  }

  const width = asFiniteNumber(value.width);
  if (width !== undefined) {
    portal.width = width;
  }

  const type = asEnum(value.type, PORTAL_TYPES);
  if (type) {
    portal.type = type;
  }

  return portal;
}

function normalizeNavNode(
  value: unknown,
  fallback: NavNodeModel,
): NavNodeModel {
  const node = structuredClone(fallback);

  if (!isRecord(value)) {
    return node;
  }

  if (isRecord(value.position)) {
    const x = asFiniteNumber(value.position.x);
    const z = asFiniteNumber(value.position.z);
    if (x !== undefined && z !== undefined) {
      node.position = { x, z };
    }
  }

  const zoneId = asString(value.zoneId);
  if (zoneId) {
    node.zoneId = zoneId;
  } else if (value.zoneId === null) {
    delete node.zoneId;
  }

  const isPortal = asBoolean(value.isPortal);
  if (isPortal !== undefined) {
    node.isPortal = isPortal;
  }

  return node;
}

function normalizeNavEdge(
  value: unknown,
  fallback: NavEdgeModel,
): NavEdgeModel {
  const edge = structuredClone(fallback);

  if (!isRecord(value)) {
    return edge;
  }

  const from = asString(value.from);
  if (from) {
    edge.from = from;
  }

  const to = asString(value.to);
  if (to) {
    edge.to = to;
  }

  const weight = asFiniteNumber(value.weight);
  if (weight !== undefined) {
    edge.weight = Math.max(weight, 0);
  }

  const blocked = asBoolean(value.blocked);
  if (blocked !== undefined) {
    edge.blocked = blocked;
  }

  return edge;
}

function normalizeRecentEvents(
  value: unknown,
  fallback: RecentEventModel[],
): RecentEventModel[] {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }

  const events = value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const tick = asFiniteNumber(entry.tick);
    const type = asString(entry.type);
    if (tick === undefined || !type) {
      return [];
    }

    return [{
      tick,
      type,
      detail: asString(entry.detail),
    }];
  });

  return events.length > 0 ? events : structuredClone(fallback);
}

function normalizeAgent(
  value: unknown,
  fallback: AgentModel,
): AgentModel {
  const agent = structuredClone(fallback);

  if (!isRecord(value)) {
    return agent;
  }

  const visual = isRecord(value.visual) ? value.visual : null;
  const social = isRecord(value.social) ? value.social : null;
  const mind = isRecord(value.mind) ? value.mind : null;
  const locomotion = isRecord(value.locomotion) ? value.locomotion : null;
  const runtime = isRecord(value.runtime) ? value.runtime : null;

  if (visual) {
    const gender = asEnum(visual.gender, GENDERS);
    if (gender) {
      agent.visual.gender = gender;
    }

    const ageGroup = asEnum(visual.ageGroup, AGE_GROUPS);
    if (ageGroup) {
      agent.visual.ageGroup = ageGroup;
    }

    const bodyType = asEnum(visual.bodyType, BODY_TYPES);
    if (bodyType) {
      agent.visual.bodyType = bodyType;
    }

    const heightBucket = asEnum(visual.heightBucket, HEIGHT_BUCKETS);
    if (heightBucket) {
      agent.visual.heightBucket = heightBucket;
    }

    const clothingStyle = asEnum(visual.clothingStyle, CLOTHING_STYLES);
    if (clothingStyle) {
      agent.visual.clothingStyle = clothingStyle;
    }

    if (isRecord(visual.clothingColors)) {
      agent.visual.clothingColors = {
        top: asString(visual.clothingColors.top) ?? agent.visual.clothingColors.top,
        bottom: asString(visual.clothingColors.bottom) ?? agent.visual.clothingColors.bottom,
        accent: asString(visual.clothingColors.accent) ?? agent.visual.clothingColors.accent,
      };
    }

    const hairColor = asString(visual.hairColor);
    if (hairColor) {
      agent.visual.hairColor = hairColor;
    }

    const hairLength = asEnum(visual.hairLength, HAIR_LENGTHS);
    if (hairLength) {
      agent.visual.hairLength = hairLength;
    }

    const props = asStringArray(visual.props);
    if (props) {
      agent.visual.props = props;
    }

    const initialPose = asEnum(visual.initialPose, POSES);
    if (initialPose) {
      agent.visual.initialPose = initialPose;
    }
  }

  const baselinePosition = agent.visual.spatialEstimate.position3d;
  const spatialEstimate = normalizeSpatialEstimate(
    visual?.spatialEstimate,
    agent.visual.spatialEstimate,
    baselinePosition,
  );
  const runtimePosition = normalizeVec3(runtime?.position, spatialEstimate.position3d);
  spatialEstimate.position3d = { ...runtimePosition };
  agent.visual.spatialEstimate = spatialEstimate;

  if (social) {
    const groupId = asString(social.groupId);
    if (groupId) {
      agent.social.groupId = groupId;
    } else if (social.groupId === null) {
      delete agent.social.groupId;
    }

    agent.social.companionIds = asStringArray(social.companionIds) ?? agent.social.companionIds;

    if (Array.isArray(social.likelyRelationships)) {
      agent.social.likelyRelationships = social.likelyRelationships
        .map((entry) => asEnum(entry, RELATIONSHIPS))
        .filter((entry): entry is (typeof RELATIONSHIPS)[number] => entry !== undefined);
    }

    const followTendency = asFiniteNumber(social.followTendency);
    if (followTendency !== undefined) {
      agent.social.followTendency = clamp(followTendency, 0, 1);
    }

    const sociability = asFiniteNumber(social.sociability);
    if (sociability !== undefined) {
      agent.social.sociability = clamp(sociability, 0, 1);
    }

    const interactionCooldownSec = asFiniteNumber(social.interactionCooldownSec);
    if (interactionCooldownSec !== undefined) {
      agent.social.interactionCooldownSec = Math.max(0, interactionCooldownSec);
    }
  }

  if (mind) {
    const archetype = asEnum(mind.archetype, ARCHETYPES);
    if (archetype) {
      agent.mind.archetype = archetype;
    }

    agent.mind.primaryGoal = normalizeGoal(mind.primaryGoal, agent.mind.primaryGoal);

    if (mind.secondaryGoal === null) {
      delete agent.mind.secondaryGoal;
    } else if (isRecord(mind.secondaryGoal)) {
      agent.mind.secondaryGoal = normalizeGoal(
        mind.secondaryGoal,
        agent.mind.secondaryGoal ?? agent.mind.primaryGoal,
      );
    }

    const currentIntent = asString(mind.currentIntent);
    if (currentIntent) {
      agent.mind.currentIntent = currentIntent;
    }

    const arousal = asFiniteNumber(mind.arousal);
    if (arousal !== undefined) {
      agent.mind.arousal = clamp(arousal, 0, 1);
    }

    const patience = asFiniteNumber(mind.patience);
    if (patience !== undefined) {
      agent.mind.patience = clamp(patience, 0, 1);
    }

    const curiosity = asFiniteNumber(mind.curiosity);
    if (curiosity !== undefined) {
      agent.mind.curiosity = clamp(curiosity, 0, 1);
    }

    const conformity = asFiniteNumber(mind.conformity);
    if (conformity !== undefined) {
      agent.mind.conformity = clamp(conformity, 0, 1);
    }

    const reactionStyle = asEnum(mind.reactionStyle, REACTION_STYLES);
    if (reactionStyle) {
      agent.mind.reactionStyle = reactionStyle;
    }

    agent.mind.likelyNextActions = normalizeLikelyNextActions(
      mind.likelyNextActions,
      agent.mind.likelyNextActions,
    );

    const confidence = asFiniteNumber(mind.confidence);
    if (confidence !== undefined) {
      agent.mind.confidence = clamp(confidence, 0, 1);
    }
  }

  if (locomotion) {
    const speed = asFiniteNumber(locomotion.speed);
    if (speed !== undefined) {
      agent.locomotion.speed = Math.max(0, speed);
    }

    const maxSpeed = asFiniteNumber(locomotion.maxSpeed);
    if (maxSpeed !== undefined) {
      agent.locomotion.maxSpeed = Math.max(0, maxSpeed);
    }

    const acceleration = asFiniteNumber(locomotion.acceleration);
    if (acceleration !== undefined) {
      agent.locomotion.acceleration = Math.max(0, acceleration);
    }

    const isMoving = asBoolean(locomotion.isMoving);
    if (isMoving !== undefined) {
      agent.locomotion.isMoving = isMoving;
    }

    const isBlocked = asBoolean(locomotion.isBlocked);
    if (isBlocked !== undefined) {
      agent.locomotion.isBlocked = isBlocked;
    }

    const stuckTickCount = asFiniteNumber(locomotion.stuckTickCount);
    if (stuckTickCount !== undefined) {
      agent.locomotion.stuckTickCount = Math.max(0, stuckTickCount);
    }
  }

  agent.runtime.position = runtimePosition;
  agent.runtime.velocity = normalizeVec3(runtime?.velocity, agent.runtime.velocity);

  if (runtime) {
    const heading = asFiniteNumber(runtime.heading);
    if (heading !== undefined) {
      agent.runtime.heading = heading;
    }

    if (Array.isArray(runtime.currentPath)) {
      agent.runtime.currentPath = runtime.currentPath
        .map((entry) => normalizeVec3(entry, agent.runtime.position))
        .filter((entry) => entry !== null);
    }

    const animationState = asEnum(runtime.animationState, ANIMATION_STATES);
    if (animationState) {
      agent.runtime.animationState = animationState;
    }

    const blocked = asBoolean(runtime.blocked);
    if (blocked !== undefined) {
      agent.runtime.blocked = blocked;
    }

    const lastDecisionAt = asFiniteNumber(runtime.lastDecisionAt);
    if (lastDecisionAt !== undefined) {
      agent.runtime.lastDecisionAt = lastDecisionAt;
    }

    const nextMindRefreshAt = asFiniteNumber(runtime.nextMindRefreshAt);
    if (nextMindRefreshAt !== undefined) {
      agent.runtime.nextMindRefreshAt = nextMindRefreshAt;
    }

    const goalStartedAt = asFiniteNumber(runtime.goalStartedAt);
    if (goalStartedAt !== undefined) {
      agent.runtime.goalStartedAt = goalStartedAt;
    }

    const goalChangedCount = asFiniteNumber(runtime.goalChangedCount);
    if (goalChangedCount !== undefined) {
      agent.runtime.goalChangedCount = Math.max(0, goalChangedCount);
    }

    if (runtime.lastInteractionAt === null || asFiniteNumber(runtime.lastInteractionAt) !== undefined) {
      agent.runtime.lastInteractionAt =
        runtime.lastInteractionAt === null ? null : asFiniteNumber(runtime.lastInteractionAt) ?? agent.runtime.lastInteractionAt;
    }

    if (runtime.lastInteractionPartnerId === null || typeof runtime.lastInteractionPartnerId === "string") {
      agent.runtime.lastInteractionPartnerId =
        runtime.lastInteractionPartnerId === null
          ? null
          : runtime.lastInteractionPartnerId;
    }

    if (runtime.activeInteractionId === null || typeof runtime.activeInteractionId === "string") {
      agent.runtime.activeInteractionId =
        runtime.activeInteractionId === null
          ? null
          : runtime.activeInteractionId;
    }

    if (runtime.occupyingObjectId === null || typeof runtime.occupyingObjectId === "string") {
      agent.runtime.occupyingObjectId =
        runtime.occupyingObjectId === null
          ? null
          : runtime.occupyingObjectId;
    }

    if (runtime.occupyingZoneId === null || typeof runtime.occupyingZoneId === "string") {
      agent.runtime.occupyingZoneId =
        runtime.occupyingZoneId === null
          ? null
          : runtime.occupyingZoneId;
    }

    if (runtime.queuePosition === null || asFiniteNumber(runtime.queuePosition) !== undefined) {
      agent.runtime.queuePosition =
        runtime.queuePosition === null ? null : asFiniteNumber(runtime.queuePosition) ?? agent.runtime.queuePosition;
    }

    if (runtime.queueTargetZoneId === null || typeof runtime.queueTargetZoneId === "string") {
      agent.runtime.queueTargetZoneId =
        runtime.queueTargetZoneId === null
          ? null
          : runtime.queueTargetZoneId;
    }

    agent.runtime.recentEvents = normalizeRecentEvents(runtime.recentEvents, agent.runtime.recentEvents);
  }

  return agent;
}

function repairSceneConsistency(
  scene: CompiledScenePackage,
  baseline: CompiledScenePackage,
): CompiledScenePackage {
  const repaired = structuredClone(scene);
  const agentIds = new Set(repaired.agents.map((agent) => agent.id));
  const objectIds = new Set(repaired.environment.objects.map((object) => object.id));
  const zoneIds = new Set(repaired.environment.semanticZones.map((zone) => zone.id));

  repaired.environment.semanticZones = repaired.environment.semanticZones.map((zone) => ({
    ...zone,
    occupantIds: uniqueStrings(zone.occupantIds.filter((id) => agentIds.has(id))),
    queueIds: uniqueStrings(zone.queueIds.filter((id) => agentIds.has(id))),
  }));

  repaired.agents = repaired.agents.map((agent) => {
    agent.social.companionIds = uniqueStrings(
      agent.social.companionIds.filter((id) => id !== agent.id && agentIds.has(id)),
    );

    if (agent.social.likelyRelationships) {
      agent.social.likelyRelationships = agent.social.likelyRelationships.slice(
        0,
        agent.social.companionIds.length,
      );
    }

    if (agent.runtime.occupyingObjectId && !objectIds.has(agent.runtime.occupyingObjectId)) {
      agent.runtime.occupyingObjectId = null;
    }

    if (agent.runtime.occupyingZoneId && !zoneIds.has(agent.runtime.occupyingZoneId)) {
      agent.runtime.occupyingZoneId = null;
    }

    if (agent.runtime.queueTargetZoneId && !zoneIds.has(agent.runtime.queueTargetZoneId)) {
      agent.runtime.queueTargetZoneId = null;
    }

    if (agent.mind.primaryGoal.targetObjectId && !objectIds.has(agent.mind.primaryGoal.targetObjectId)) {
      delete agent.mind.primaryGoal.targetObjectId;
    }
    if (agent.mind.primaryGoal.targetZoneId && !zoneIds.has(agent.mind.primaryGoal.targetZoneId)) {
      delete agent.mind.primaryGoal.targetZoneId;
    }
    if (agent.mind.primaryGoal.targetAgentId && !agentIds.has(agent.mind.primaryGoal.targetAgentId)) {
      delete agent.mind.primaryGoal.targetAgentId;
    }

    if (agent.mind.secondaryGoal) {
      if (agent.mind.secondaryGoal.targetObjectId && !objectIds.has(agent.mind.secondaryGoal.targetObjectId)) {
        delete agent.mind.secondaryGoal.targetObjectId;
      }
      if (agent.mind.secondaryGoal.targetZoneId && !zoneIds.has(agent.mind.secondaryGoal.targetZoneId)) {
        delete agent.mind.secondaryGoal.targetZoneId;
      }
      if (agent.mind.secondaryGoal.targetAgentId && !agentIds.has(agent.mind.secondaryGoal.targetAgentId)) {
        delete agent.mind.secondaryGoal.targetAgentId;
      }
    }

    return agent;
  });

  const nodeIds = new Set(repaired.environment.navigationGraph.nodes.map((node) => node.id));
  repaired.environment.navigationGraph.nodes = repaired.environment.navigationGraph.nodes.map((node) => {
    if (node.zoneId && !zoneIds.has(node.zoneId)) {
      const withoutZone = { ...node };
      delete withoutZone.zoneId;
      return withoutZone;
    }
    return node;
  });

  repaired.environment.navigationGraph.edges = repaired.environment.navigationGraph.edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );

  if (
    repaired.environment.navigationGraph.nodes.length === 0 ||
    repaired.environment.navigationGraph.edges.length === 0
  ) {
    repaired.environment.navigationGraph = structuredClone(baseline.environment.navigationGraph);
  }

  repaired.style.objectOverrides = repaired.style.objectOverrides.filter((entry) => objectIds.has(entry.objectId));
  repaired.style.agentStyleOverrides = repaired.style.agentStyleOverrides.filter((entry) => agentIds.has(entry.agentId));

  repaired.assets.furniture = repaired.assets.furniture.filter((entry) => objectIds.has(entry.objectId));
  if (repaired.assets.furniture.length === 0) {
    repaired.assets.furniture = structuredClone(baseline.assets.furniture);
  }

  repaired.assets.characters = repaired.assets.characters.filter((entry) => agentIds.has(entry.agentId));

  const occupancyByObject = new Map<string, string>();
  for (const agent of repaired.agents) {
    if (agent.runtime.occupyingObjectId && objectIds.has(agent.runtime.occupyingObjectId)) {
      occupancyByObject.set(agent.runtime.occupyingObjectId, agent.id);
    }
  }

  repaired.environment.objects = repaired.environment.objects.map((object) => ({
    ...object,
    occupiedByAgentId: occupancyByObject.get(object.id) ?? null,
  }));

  repaired.compileMetadata.uncertainty = uniqueStrings(repaired.compileMetadata.uncertainty);

  return repaired;
}

function normalizeStructuredSceneCandidate(
  raw: unknown,
  baseline: CompiledScenePackage,
): CompiledScenePackage {
  const scene = structuredClone(baseline);

  if (!isRecord(raw)) {
    return repairSceneConsistency(scene, baseline);
  }

  if (isRecord(raw.sourceVideo)) {
    const durationSec = asFiniteNumber(raw.sourceVideo.durationSec);
    if (durationSec !== undefined) {
      scene.sourceVideo.durationSec = durationSec;
    }

    const width = asFiniteNumber(raw.sourceVideo.width);
    if (width !== undefined) {
      scene.sourceVideo.width = width;
    }

    const height = asFiniteNumber(raw.sourceVideo.height);
    if (height !== undefined) {
      scene.sourceVideo.height = height;
    }

    const fpsSampled = asFiniteNumber(raw.sourceVideo.fpsSampled);
    if (fpsSampled !== undefined) {
      scene.sourceVideo.fpsSampled = fpsSampled;
    }
  }

  if (isRecord(raw.sceneContext)) {
    if (isRecord(raw.sceneContext.estimatedLocation)) {
      const type = asEnum(raw.sceneContext.estimatedLocation.type, LOCATION_TYPES);
      if (type) {
        scene.sceneContext.estimatedLocation.type = type;
      }
      scene.sceneContext.estimatedLocation.regionHint =
        asString(raw.sceneContext.estimatedLocation.regionHint) ??
        scene.sceneContext.estimatedLocation.regionHint;
      scene.sceneContext.estimatedLocation.venueTypeHint =
        asString(raw.sceneContext.estimatedLocation.venueTypeHint) ??
        scene.sceneContext.estimatedLocation.venueTypeHint;
      const culturalCues = asStringArray(raw.sceneContext.estimatedLocation.culturalCues);
      if (culturalCues) {
        scene.sceneContext.estimatedLocation.culturalCues = culturalCues;
      }
    }

    if (isRecord(raw.sceneContext.estimatedTime)) {
      const timeOfDay = asEnum(raw.sceneContext.estimatedTime.timeOfDay, TIME_OF_DAYS);
      if (timeOfDay) {
        scene.sceneContext.estimatedTime.timeOfDay = timeOfDay;
      }

      const dayTypeHint = asEnum(raw.sceneContext.estimatedTime.dayTypeHint, DAY_TYPES);
      if (dayTypeHint) {
        scene.sceneContext.estimatedTime.dayTypeHint = dayTypeHint;
      }

      const seasonHint = asEnum(raw.sceneContext.estimatedTime.seasonHint, SEASONS);
      if (seasonHint) {
        scene.sceneContext.estimatedTime.seasonHint = seasonHint;
      }

      scene.sceneContext.estimatedTime.lightingEvidence =
        asString(raw.sceneContext.estimatedTime.lightingEvidence) ??
        scene.sceneContext.estimatedTime.lightingEvidence;
    }

    scene.sceneContext.globalSummary =
      asString(raw.sceneContext.globalSummary) ?? scene.sceneContext.globalSummary;

    const crowdDensity = asEnum(raw.sceneContext.crowdDensity, CROWD_DENSITIES);
    if (crowdDensity) {
      scene.sceneContext.crowdDensity = crowdDensity;
    }

    scene.sceneContext.dominantActivity =
      asString(raw.sceneContext.dominantActivity) ?? scene.sceneContext.dominantActivity;
  }

  const rawEnvironment = isRecord(raw.environment) ? raw.environment : null;
  if (rawEnvironment) {
    const spaceType = asEnum(rawEnvironment.spaceType, SPACE_TYPES);
    if (spaceType) {
      scene.environment.spaceType = spaceType;
    }

    if (isRecord(rawEnvironment.bounds)) {
      const width = asFiniteNumber(rawEnvironment.bounds.width);
      if (width !== undefined) {
        scene.environment.bounds.width = width;
      }
      const depth = asFiniteNumber(rawEnvironment.bounds.depth);
      if (depth !== undefined) {
        scene.environment.bounds.depth = depth;
      }
      const height = asFiniteNumber(rawEnvironment.bounds.height);
      if (height !== undefined) {
        scene.environment.bounds.height = height;
      }
    }

    scene.environment.floorPlan = normalizePolygon(
      rawEnvironment.floorPlan,
      scene.environment.floorPlan,
    );

    if (Array.isArray(rawEnvironment.walkableZones) && rawEnvironment.walkableZones.length > 0) {
      scene.environment.walkableZones = rawEnvironment.walkableZones.map((entry, index) =>
        normalizePolygon(entry, scene.environment.walkableZones[index] ?? scene.environment.floorPlan),
      );
    }

    if (Array.isArray(rawEnvironment.blockedZones) && rawEnvironment.blockedZones.length > 0) {
      scene.environment.blockedZones = rawEnvironment.blockedZones.map((entry, index) =>
        normalizePolygon(entry, scene.environment.blockedZones[index] ?? scene.environment.floorPlan),
      );
    }

    const rawEntrances = Array.isArray(rawEnvironment.entrances) ? rawEnvironment.entrances : null;
    if (rawEntrances && rawEntrances.length > 0) {
      scene.environment.entrances = scene.environment.entrances.map((entry, index) =>
        normalizePortal(
          findCandidateByIdOrIndex(rawEntrances, entry.id, index),
          entry,
        ),
      );
    }

    const rawExits = Array.isArray(rawEnvironment.exits) ? rawEnvironment.exits : null;
    if (rawExits && rawExits.length > 0) {
      scene.environment.exits = scene.environment.exits.map((entry, index) =>
        normalizePortal(
          findCandidateByIdOrIndex(rawExits, entry.id, index),
          entry,
        ),
      );
    }

    const rawObjects = Array.isArray(rawEnvironment.objects) ? rawEnvironment.objects : null;
    if (rawObjects && rawObjects.length > 0) {
      scene.environment.objects = scene.environment.objects.map((entry, index) =>
        normalizeSceneObject(
          findCandidateByIdOrIndex(rawObjects, entry.id, index),
          entry,
        ),
      );
    }

    const rawSemanticZones = Array.isArray(rawEnvironment.semanticZones)
      ? rawEnvironment.semanticZones
      : null;
    if (rawSemanticZones && rawSemanticZones.length > 0) {
      scene.environment.semanticZones = scene.environment.semanticZones.map((entry, index) =>
        normalizeSemanticZone(
          findCandidateByIdOrIndex(rawSemanticZones, entry.id, index),
          entry,
        ),
      );
    }

    const rawNavigationGraph = isRecord(rawEnvironment.navigationGraph)
      ? rawEnvironment.navigationGraph
      : null;
    const rawNavNodes = rawNavigationGraph && Array.isArray(rawNavigationGraph.nodes)
      ? rawNavigationGraph.nodes
      : null;
    const rawNavEdges = rawNavigationGraph && Array.isArray(rawNavigationGraph.edges)
      ? rawNavigationGraph.edges
      : null;
    if (rawNavNodes && rawNavEdges) {
      if (rawNavNodes.length > 0) {
        scene.environment.navigationGraph.nodes = scene.environment.navigationGraph.nodes.map((entry, index) =>
          normalizeNavNode(
            findCandidateByIdOrIndex(rawNavNodes, entry.id, index),
            entry,
          ),
        );
      }

      if (
        rawNavEdges.length > 0 &&
        scene.environment.navigationGraph.edges.length > 0
      ) {
        scene.environment.navigationGraph.edges = rawNavEdges.map((entry, index) =>
          normalizeNavEdge(
            entry,
            scene.environment.navigationGraph.edges[index] ?? scene.environment.navigationGraph.edges[0],
          ),
        );
      }
    }
  }

  const rawAgents = Array.isArray(raw.agents) ? raw.agents : null;
  if (rawAgents && rawAgents.length > 0) {
    scene.agents = scene.agents.map((entry, index) =>
      normalizeAgent(findCandidateByIdOrIndex(rawAgents, entry.id, index), entry),
    );
  }

  if (isRecord(raw.style)) {
    if (isRecord(raw.style.environmentPalette)) {
      scene.style.environmentPalette = {
        wallPrimary: asString(raw.style.environmentPalette.wallPrimary) ?? scene.style.environmentPalette.wallPrimary,
        wallSecondary: asString(raw.style.environmentPalette.wallSecondary) ?? scene.style.environmentPalette.wallSecondary,
        floor: asString(raw.style.environmentPalette.floor) ?? scene.style.environmentPalette.floor,
        accent: asString(raw.style.environmentPalette.accent) ?? scene.style.environmentPalette.accent,
        lightingMood: asEnum(raw.style.environmentPalette.lightingMood, LIGHTING_MOODS) ?? scene.style.environmentPalette.lightingMood,
        lightingDirection: asEnum(raw.style.environmentPalette.lightingDirection, LIGHTING_DIRECTIONS) ?? scene.style.environmentPalette.lightingDirection,
        overallWarmth: asFiniteNumber(raw.style.environmentPalette.overallWarmth) ?? scene.style.environmentPalette.overallWarmth,
        floorMaterial: asEnum(raw.style.environmentPalette.floorMaterial, FLOOR_MATERIALS) ?? scene.style.environmentPalette.floorMaterial,
        wallMaterial: asEnum(raw.style.environmentPalette.wallMaterial, WALL_MATERIALS) ?? scene.style.environmentPalette.wallMaterial,
      };
    }

    const dominantPalette = asStringArray(raw.style.dominantPalette);
    if (dominantPalette && dominantPalette.length > 0) {
      scene.style.dominantPalette = dominantPalette;
    }

    if (Array.isArray(raw.style.objectOverrides)) {
      const overrides = raw.style.objectOverrides.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }

        const objectId = asString(entry.objectId);
        if (!objectId) {
          return [];
        }

        return [{
          objectId,
          primaryColor: asString(entry.primaryColor),
          secondaryColor: asString(entry.secondaryColor),
        }];
      });

      if (overrides.length > 0) {
        scene.style.objectOverrides = overrides;
      }
    }

    if (Array.isArray(raw.style.agentStyleOverrides)) {
      const overrides = raw.style.agentStyleOverrides.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }

        const agentId = asString(entry.agentId);
        if (!agentId) {
          return [];
        }

        return [{
          agentId,
          topColor: asString(entry.topColor),
          bottomColor: asString(entry.bottomColor),
          accentColor: asString(entry.accentColor),
        }];
      });

      if (overrides.length > 0) {
        scene.style.agentStyleOverrides = overrides;
      }
    }
  }

  if (isRecord(raw.assets)) {
    const roomShell = asString(raw.assets.roomShell);
    if (roomShell) {
      scene.assets.roomShell = roomShell;
    }
  }

  if (isRecord(raw.compileMetadata)) {
    const sceneConfidence = asFiniteNumber(raw.compileMetadata.sceneConfidence);
    if (sceneConfidence !== undefined) {
      scene.compileMetadata.sceneConfidence = clamp(sceneConfidence, 0, 1);
    }

    const geminiModel = asString(raw.compileMetadata.geminiModel);
    if (geminiModel) {
      scene.compileMetadata.geminiModel = geminiModel;
    }

    const uncertainty = asStringArray(raw.compileMetadata.uncertainty);
    if (uncertainty) {
      scene.compileMetadata.uncertainty = uncertainty;
    }
  }

  return repairSceneConsistency(scene, baseline);
}

function inferObjectScale(object: VideoAnalysisOutput["objects"][number]): { x: number; y: number; z: number } {
  const fallback = DEFAULT_OBJECT_SCALES[normalizeObjectType(object.label)] ?? DEFAULT_OBJECT_SCALES.unknown;
  return {
    x: object.estimatedWidthMeters ?? fallback.x,
    y: object.estimatedHeightMeters ?? fallback.y,
    z: object.estimatedDepthMeters ?? fallback.z,
  };
}

function inferZoneWeight(type: VideoAnalysisOutput["zones"][number]["type"]): number {
  switch (type) {
    case "seating":
      return 0.8;
    case "service":
      return 0.6;
    case "circulation":
      return 0.2;
    case "entry":
    case "exit":
      return 0.1;
    default:
      return 0.5;
  }
}

function inferArchetype(person: VideoAnalysisOutput["persons"][number]): CompiledScenePackage["agents"][number]["mind"]["archetype"] {
  const activity = person.apparentActivity.toLowerCase();

  if (person.clothingStyle === "uniform" || activity.includes("staff")) {
    return "staff";
  }
  if (person.groupIndex !== null) {
    return "social_group_member";
  }
  if (person.pose === "sitting" && (activity.includes("laptop") || activity.includes("typing") || activity.includes("working"))) {
    return "seated_worker";
  }
  if (activity.includes("leave") || activity.includes("exit")) {
    return "person_leaving";
  }
  if (activity.includes("looking around") || activity.includes("uncertain")) {
    return "uncertain_visitor";
  }
  if (person.pose === "walking") {
    return "late_arrival";
  }
  if (person.pose === "standing") {
    return "waiting_guest";
  }
  return "unknown";
}

function buildLikelyNextActions(
  archetype: CompiledScenePackage["agents"][number]["mind"]["archetype"],
  apparentActivity: string,
): CompiledScenePackage["agents"][number]["mind"]["likelyNextActions"] {
  switch (archetype) {
    case "staff":
      return [
        { label: "continue serving nearby people", probability: 0.5 },
        { label: "reposition behind the counter", probability: 0.3 },
        { label: "scan the room for the next request", probability: 0.2 },
      ];
    case "seated_worker":
      return [
        { label: apparentActivity || "continue focused work", probability: 0.55 },
        { label: "glance around briefly", probability: 0.25 },
        { label: "adjust posture or belongings", probability: 0.2 },
      ];
    case "social_group_member":
      return [
        { label: "continue interacting with the group", probability: 0.5 },
        { label: "shift position slightly", probability: 0.25 },
        { label: "look toward another person nearby", probability: 0.25 },
      ];
    default:
      return [
        { label: apparentActivity || "continue current activity", probability: 0.5 },
        { label: "look around the room", probability: 0.3 },
        { label: "reposition slightly", probability: 0.2 },
      ];
  }
}

function getPolygonBounds(polygon: PolygonModel): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const xs = polygon.points.map((point) => point.x);
  const zs = polygon.points.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function samplePositionInPolygon(
  polygon: PolygonModel,
  slotIndex: number,
  totalSlots: number,
  y = 0,
): { x: number; y: number; z: number } {
  const bounds = getPolygonBounds(polygon);
  const columns = Math.max(1, Math.ceil(Math.sqrt(totalSlots)));
  const rows = Math.max(1, Math.ceil(totalSlots / columns));
  const column = slotIndex % columns;
  const row = Math.floor(slotIndex / columns);

  const x =
    bounds.minX +
    (bounds.maxX - bounds.minX) * ((column + 1) / (columns + 1));
  const z =
    bounds.minZ +
    (bounds.maxZ - bounds.minZ) * ((row + 1) / (rows + 1));

  return { x, y, z };
}

function targetAgentCountForDensity(
  density: VideoAnalysisOutput["sceneContext"]["crowdDensity"],
  detectedCount: number,
  semanticZones: SemanticZoneModel[],
): number {
  const minimumByDensity = {
    sparse: detectedCount,
    moderate: Math.max(detectedCount, 6),
    dense: Math.max(detectedCount, 12),
  } satisfies Record<VideoAnalysisOutput["sceneContext"]["crowdDensity"], number>;

  const capacityLimit = semanticZones.reduce((sum, zone) => sum + (zone.capacity ?? 0), 0);
  const softCap =
    capacityLimit > 0
      ? Math.min(capacityLimit, 20)
      : density === "dense"
        ? 20
        : density === "moderate"
          ? 10
          : detectedCount;

  return Math.max(detectedCount, Math.min(minimumByDensity[density], softCap));
}

function inferSyntheticArchetype(
  zoneType: SemanticZoneModel["type"],
  pose: AgentModel["visual"]["initialPose"],
): AgentModel["mind"]["archetype"] {
  if (zoneType === "seating" && pose === "sitting") {
    return "seated_worker";
  }
  if (zoneType === "circulation" && pose === "walking") {
    return "late_arrival";
  }
  if (zoneType === "waiting") {
    return "waiting_guest";
  }
  if (zoneType === "service") {
    return "staff";
  }
  return pose === "walking" ? "late_arrival" : "waiting_guest";
}

function buildSyntheticActivity(
  zoneType: SemanticZoneModel["type"],
  pose: AgentModel["visual"]["initialPose"],
): string {
  if (zoneType === "seating") {
    return pose === "sitting" ? "working quietly at a shared table" : "looking for an open seat";
  }
  if (zoneType === "circulation") {
    return pose === "walking" ? "moving through the main circulation path" : "pausing to scan the room";
  }
  if (zoneType === "waiting") {
    return "waiting for a teammate or the next activity";
  }
  if (zoneType === "service") {
    return "helping coordinate activity near the service area";
  }
  return "participating in the event";
}

function inferAdditionalFurniture(
  objects: CompiledScenePackage["environment"]["objects"],
  semanticZones: SemanticZoneModel[],
  spaceType: VideoAnalysisOutput["spaceType"],
  bounds: { width: number; depth: number; height: number },
  dominantPalette: string[],
): CompiledScenePackage["environment"]["objects"] {
  const additional: CompiledScenePackage["environment"]["objects"] = [];
  let nextId = objects.length + 1;

  const pickColor = (index: number): string | undefined =>
    dominantPalette.length > 0
      ? dominantPalette[index % dominantPalette.length]
      : undefined;

  const findNearbyColor = (
    type: string,
    fallbackIndex: number,
  ): string | undefined => {
    const match = objects.find((o) => o.type === type && o.styleHints?.primaryColor);
    return match?.styleHints?.primaryColor ?? pickColor(fallbackIndex);
  };

  // 1. Chair multiplication: for each table/desk, compute seats from width
  const tables = objects.filter((o) => o.type === "table" || o.type === "desk");
  const existingChairs = objects.filter((o) => o.type === "chair" || o.type === "stool");

  for (const table of tables) {
    const tableWidth = table.scale.x;
    const expectedSeats = Math.floor(tableWidth / 0.6);
    // Count chairs already near this table (within 1.5m)
    const nearbyChairs = existingChairs.filter(
      (c) => distance2d(c.position, table.position) < 1.5,
    );
    const seatsToAdd = Math.max(0, expectedSeats - nearbyChairs.length);

    for (let s = 0; s < seatsToAdd; s++) {
      const side = s % 2 === 0 ? 1 : -1; // alternate sides of table
      const along = ((Math.floor(s / 2) + 1) / (Math.ceil(seatsToAdd / 2) + 1)) * tableWidth - tableWidth / 2;
      const chairX = clamp(table.position.x + along, 0.3, bounds.width - 0.3);
      const chairZ = clamp(table.position.z + side * (table.scale.z / 2 + 0.35), 0.3, bounds.depth - 0.3);

      additional.push({
        id: `obj_${nextId++}`,
        type: "chair",
        position: { x: chairX, y: 0, z: chairZ },
        rotationY: side > 0 ? Math.PI : 0,
        scale: { ...DEFAULT_OBJECT_SCALES.chair },
        interactable: true,
        blocksMovement: false,
        occupiedByAgentId: null,
        styleHints: {
          primaryColor: findNearbyColor("chair", s),
          material: "wood",
          shape: "rectangular",
        },
        spatialEstimate: {
          position3d: { x: chairX, y: 0, z: chairZ },
          confidence3d: 0.3,
          projectionSource: "heuristic_2d",
          videoBoundingBox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        },
      });
    }
  }

  // 2. Zone-based infill: for seating zones with capacity > current object count
  for (const zone of semanticZones) {
    if (zone.type !== "seating") continue;
    const capacity = zone.capacity ?? 0;
    const zoneBounds = getPolygonBounds(zone.polygon);
    const objectsInZone = [...objects, ...additional].filter((o) => {
      return (
        o.position.x >= zoneBounds.minX &&
        o.position.x <= zoneBounds.maxX &&
        o.position.z >= zoneBounds.minZ &&
        o.position.z <= zoneBounds.maxZ
      );
    });
    const seatCount = objectsInZone.filter(
      (o) => o.type === "chair" || o.type === "stool" || o.type === "sofa",
    ).length;
    const targetSeats = Math.floor(capacity * 0.6);
    const tablesInZone = objectsInZone.filter(
      (o) => o.type === "table" || o.type === "desk",
    ).length;

    // Add table+chair sets if zone is under-furnished
    if (seatCount < targetSeats && tablesInZone === 0 && targetSeats >= 2) {
      const setsToAdd = Math.min(3, Math.ceil((targetSeats - seatCount) / 4));
      for (let s = 0; s < setsToAdd; s++) {
        const pos = samplePositionInPolygon(zone.polygon, s, setsToAdd);
        additional.push({
          id: `obj_${nextId++}`,
          type: "table",
          position: { x: pos.x, y: 0, z: pos.z },
          rotationY: 0,
          scale: { ...DEFAULT_OBJECT_SCALES.table },
          interactable: true,
          blocksMovement: true,
          occupiedByAgentId: null,
          styleHints: {
            primaryColor: findNearbyColor("table", s),
            material: "wood",
            shape: "rectangular",
          },
          spatialEstimate: {
            position3d: { x: pos.x, y: 0, z: pos.z },
            confidence3d: 0.3,
            projectionSource: "heuristic_2d",
            videoBoundingBox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
          },
        });
        // Add 2 chairs per table
        for (let c = 0; c < 2; c++) {
          const side = c === 0 ? 1 : -1;
          const cx = clamp(pos.x, 0.3, bounds.width - 0.3);
          const cz = clamp(pos.z + side * 0.75, 0.3, bounds.depth - 0.3);
          additional.push({
            id: `obj_${nextId++}`,
            type: "chair",
            position: { x: cx, y: 0, z: cz },
            rotationY: side > 0 ? Math.PI : 0,
            scale: { ...DEFAULT_OBJECT_SCALES.chair },
            interactable: true,
            blocksMovement: false,
            occupiedByAgentId: null,
            styleHints: {
              primaryColor: findNearbyColor("chair", c),
              material: "wood",
              shape: "rectangular",
            },
            spatialEstimate: {
              position3d: { x: cx, y: 0, z: cz },
              confidence3d: 0.3,
              projectionSource: "heuristic_2d",
              videoBoundingBox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
            },
          });
        }
      }
    }
  }

  // 3. Venue-type defaults: ensure minimum furniture by space type
  const typeCount = (type: string) =>
    [...objects, ...additional].filter((o) => o.type === type).length;

  const ensureMinimum = (
    type: SceneObjectModel["type"],
    minCount: number,
    defaultY: number,
    wallMounted: boolean,
  ) => {
    const deficit = minCount - typeCount(type);
    for (let i = 0; i < deficit; i++) {
      const x = wallMounted
        ? (i % 2 === 0 ? 0.3 : bounds.width - 0.3)
        : clamp(bounds.width * ((i + 1) / (deficit + 1)), 0.5, bounds.width - 0.5);
      const z = wallMounted
        ? clamp(bounds.depth * ((i + 1) / (deficit + 1)), 0.5, bounds.depth - 0.5)
        : clamp(bounds.depth * ((i + 1) / (deficit + 1)), 0.5, bounds.depth - 0.5);
      const scale = DEFAULT_OBJECT_SCALES[type] ?? DEFAULT_OBJECT_SCALES.unknown;
      additional.push({
        id: `obj_${nextId++}`,
        type,
        position: { x, y: defaultY, z },
        rotationY: 0,
        scale: { ...scale },
        interactable: type !== "plant" && type !== "trash_can",
        blocksMovement: type === "table" || type === "desk" || type === "counter" || type === "bookshelf",
        occupiedByAgentId: null,
        styleHints: {
          primaryColor: findNearbyColor(type, i),
          material: scale === DEFAULT_OBJECT_SCALES.whiteboard ? "plastic" : "wood",
          shape: "rectangular",
        },
        spatialEstimate: {
          position3d: { x, y: defaultY, z },
          confidence3d: 0.3,
          projectionSource: "heuristic_2d",
          videoBoundingBox: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
        },
      });
    }
  };

  switch (spaceType) {
    case "cafe":
      ensureMinimum("counter", 1, 0, false);
      ensureMinimum("table", 3, 0, false);
      ensureMinimum("chair", 6, 0, false);
      break;
    case "office":
      ensureMinimum("whiteboard", 1, 1.2, true);
      ensureMinimum("screen", 1, 1.5, true);
      ensureMinimum("desk", 3, 0, false);
      ensureMinimum("chair", 4, 0, false);
      break;
    case "meeting_room":
      ensureMinimum("whiteboard", 1, 1.2, true);
      ensureMinimum("screen", 1, 1.5, true);
      ensureMinimum("table", 1, 0, false);
      ensureMinimum("chair", 6, 0, false);
      break;
    case "classroom":
      ensureMinimum("desk", 4, 0, false);
      ensureMinimum("chair", 8, 0, false);
      ensureMinimum("whiteboard", 1, 1.2, true);
      break;
    case "lobby":
      ensureMinimum("plant", 1, 0, false);
      ensureMinimum("sofa", 1, 0, false);
      ensureMinimum("chair", 2, 0, false);
      break;
    // corridor & unknown: no defaults
  }

  return additional;
}

function buildHeuristicFallbackScene(
  videoAnalysis: VideoAnalysisOutput,
  styleExtraction: StyleExtractionOutput,
  sceneId: string,
  videoDurationSec?: number,
  reason = "heuristic_structuring_fallback",
): CompiledScenePackage {
  const bounds = {
    width: videoAnalysis.estimatedBounds.widthMeters,
    depth: videoAnalysis.estimatedBounds.depthMeters,
    height: videoAnalysis.estimatedBounds.heightMeters,
  };

  const floorPlan = {
    points: [
      { x: 0, z: 0 },
      { x: bounds.width, z: 0 },
      { x: bounds.width, z: bounds.depth },
      { x: 0, z: bounds.depth },
    ],
  };

  const objects: CompiledScenePackage["environment"]["objects"] = videoAnalysis.objects.map(
    (object, index): CompiledScenePackage["environment"]["objects"][number] => {
      const type = normalizeObjectType(object.label);
      const scale = inferObjectScale(object);
      const y =
        type === "screen"
          ? 1.5
          : type === "coffee_machine"
            ? scale.y / 2 + 0.7
            : type === "laptop"
              ? 0.75
              : 0;
      const colorOverride = styleExtraction.objectColors.find((entry) => entry.objectIndex === index);

      return {
        id: `obj_${index + 1}`,
        type,
        position: projectBoxToPosition(object.boundingBox, bounds, y),
        rotationY: 0,
        scale,
        interactable: object.interactable,
        blocksMovement: object.blocksMovement,
        occupiedByAgentId: null,
        styleHints: {
          primaryColor: colorOverride?.primaryColor ?? object.colorHint,
          secondaryColor: colorOverride?.secondaryColor ?? object.secondaryColorHint,
          material: object.material,
          shape: object.shape,
        },
        spatialEstimate: {
          position3d: projectBoxToPosition(object.boundingBox, bounds, y),
          confidence3d: clamp(object.confidence, 0.35, 0.85),
          projectionSource: "heuristic_2d",
          videoBoundingBox: object.boundingBox,
        },
      };
    },
  );

  const semanticZones =
    videoAnalysis.zones.length > 0
      ? videoAnalysis.zones.map((zone) => ({
          id: `zone_${zone.label.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()}`,
          type: zone.type,
          polygon: projectBoxToPolygon(zone.boundingBox, bounds),
          attractivenessWeight: inferZoneWeight(zone.type),
          capacity: zone.estimatedCapacity,
          occupantIds: zone.occupantPersonIndices.map(toAgentId),
          queueIds: [],
        }))
      : [
          {
            id: "zone_main",
            type: "circulation" as const,
            polygon: floorPlan,
            attractivenessWeight: 0.4,
            capacity: Math.max(4, videoAnalysis.persons.length),
            occupantIds: videoAnalysis.persons.map((person) => toAgentId(person.personIndex)),
            queueIds: [],
          },
        ];

  // Deterministic furniture infill — adds chairs near tables, fills zones, ensures venue minimums
  const additionalFurniture = inferAdditionalFurniture(
    objects,
    semanticZones,
    videoAnalysis.spaceType,
    bounds,
    styleExtraction.dominantPalette,
  );
  if (additionalFurniture.length > 0) {
    objects.push(...additionalFurniture);
  }

  // Recompute blocked zones now that furniture infill is done
  const blockedZones = objects
    .filter((object) => object.blocksMovement)
    .map((object) => {
      const halfX = Math.max(object.scale.x / 2, 0.2);
      const halfZ = Math.max(object.scale.z / 2, 0.2);
      return {
        points: [
          { x: clamp(object.position.x - halfX, 0, bounds.width), z: clamp(object.position.z - halfZ, 0, bounds.depth) },
          { x: clamp(object.position.x + halfX, 0, bounds.width), z: clamp(object.position.z - halfZ, 0, bounds.depth) },
          { x: clamp(object.position.x + halfX, 0, bounds.width), z: clamp(object.position.z + halfZ, 0, bounds.depth) },
          { x: clamp(object.position.x - halfX, 0, bounds.width), z: clamp(object.position.z + halfZ, 0, bounds.depth) },
        ],
      };
    });

  const entrances = videoAnalysis.entrancesExits
    .filter((portal) => portal.isEntrance)
    .map((portal, index) => ({
      id: `entrance_${index + 1}`,
      position: projectBoxToPosition(portal.boundingBox, bounds, 0),
      facingAngle: 0,
      width: portal.estimatedWidthMeters,
      type: portal.type,
    }));

  const exits = videoAnalysis.entrancesExits
    .filter((portal) => portal.isExit)
    .map((portal, index) => ({
      id: `exit_${index + 1}`,
      position: projectBoxToPosition(portal.boundingBox, bounds, 0),
      facingAngle: Math.PI,
      width: portal.estimatedWidthMeters,
      type: portal.type,
    }));

  const zoneNodes = semanticZones.map((zone) => {
    const center = polygonCentroid(zone.polygon);
    return {
      id: `nav_${zone.id}`,
      position: center,
      zoneId: zone.id,
      isPortal: zone.type === "entry" || zone.type === "exit",
    };
  });

  const portalNodes = [...entrances, ...exits].map((portal) => ({
    id: `nav_${portal.id}`,
    position: { x: portal.position.x, z: portal.position.z },
    zoneId: undefined,
    isPortal: true,
  }));

  const navNodes = [...zoneNodes, ...portalNodes];
  const navEdges: { from: string; to: string; weight: number; blocked: boolean }[] = [];
  const seenEdges = new Set<string>();

  const addEdge = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const key = [fromId, toId].sort().join("::");
    if (seenEdges.has(key)) return;

    const fromNode = navNodes.find((node) => node.id === fromId);
    const toNode = navNodes.find((node) => node.id === toId);
    if (!fromNode || !toNode) return;

    seenEdges.add(key);
    navEdges.push({
      from: fromId,
      to: toId,
      weight: distance2d(fromNode.position, toNode.position),
      blocked: false,
    });
  };

  for (let index = 1; index < navNodes.length; index++) {
    addEdge(navNodes[index - 1].id, navNodes[index].id);
  }

  for (const node of navNodes) {
    const nearest = [...navNodes]
      .filter((other) => other.id !== node.id)
      .sort((a, b) => distance2d(node.position, a.position) - distance2d(node.position, b.position))
      .slice(0, 2);

    for (const other of nearest) {
      addEdge(node.id, other.id);
    }
  }

  const agents: CompiledScenePackage["agents"] = videoAnalysis.persons.map(
    (person): CompiledScenePackage["agents"][number] => {
      const id = toAgentId(person.personIndex);
      const clothingOverride = styleExtraction.personClothingColors.find(
        (entry) => entry.personIndex === person.personIndex,
      );
      const position = projectBoxToPosition(person.boundingBox, bounds, 0);
      const groupId = person.groupIndex === null ? undefined : `group_${person.groupIndex}`;
      const companionIds = videoAnalysis.persons
        .filter(
          (other) =>
            other.personIndex !== person.personIndex &&
            other.groupIndex === person.groupIndex &&
            other.groupIndex !== null,
        )
        .map((other) => toAgentId(other.personIndex));
      const archetype = inferArchetype(person);
      const seatTarget =
        person.pose === "sitting"
          ? objects
              .filter((object) => object.type === "chair" || object.type === "sofa")
              .sort((a, b) => distance2d(position, a.position) - distance2d(position, b.position))[0]
          : undefined;
      const zoneMatch = semanticZones.find((zone) => zone.occupantIds.includes(id));

      let primaryGoal: CompiledScenePackage["agents"][number]["mind"]["primaryGoal"];
      if (archetype === "staff") {
        primaryGoal = {
          type: "approach_counter",
          targetZoneId: semanticZones.find((zone) => zone.type === "service")?.id,
          urgency: 0.7,
          ttlSec: 30,
        };
      } else if (person.pose === "sitting") {
        primaryGoal = {
          type: "stay_put",
          targetObjectId: seatTarget?.id,
          urgency: 0.2,
          ttlSec: 30,
        };
      } else {
        primaryGoal = {
          type: "find_seat",
          targetObjectId: seatTarget?.id,
          targetZoneId: semanticZones.find((zone) => zone.type === "seating")?.id,
          urgency: 0.55,
          ttlSec: 30,
        };
      }

      const reactionStyle: CompiledScenePackage["agents"][number]["mind"]["reactionStyle"] =
        archetype === "staff"
          ? "goal_directed"
          : archetype === "uncertain_visitor"
            ? "hesitant"
            : "calm";

      return {
        id,
        visual: {
          assetId: `char_${id}`,
          gender: person.gender,
          ageGroup: person.ageGroup,
          bodyType: person.bodyType,
          heightBucket: person.heightBucket,
          clothingColors: {
            top: clothingOverride?.topColor ?? person.topColor,
            bottom: clothingOverride?.bottomColor ?? person.bottomColor,
            accent: clothingOverride?.accentColor ?? person.accentColor,
          },
          clothingStyle: person.clothingStyle,
          hairColor: person.hairColor,
          hairLength: person.hairLength,
          props: person.props,
          initialPose: person.pose,
          spatialEstimate: {
            position3d: position,
            confidence3d: clamp(person.confidence, 0.35, 0.85),
            projectionSource: "heuristic_2d",
            videoBoundingBox: person.boundingBox,
          },
        },
        social: {
          groupId,
          companionIds,
          likelyRelationships: companionIds.map(() => "unknown" as const),
          followTendency: companionIds.length > 0 ? 0.7 : 0.15,
          sociability: archetype === "staff" ? 0.8 : companionIds.length > 0 ? 0.6 : 0.35,
          interactionCooldownSec: 10,
        },
        mind: {
          archetype,
          primaryGoal,
          currentIntent: person.apparentActivity,
          arousal: archetype === "staff" ? 0.6 : 0.4,
          patience: person.pose === "sitting" ? 0.8 : 0.55,
          curiosity: archetype === "uncertain_visitor" ? 0.75 : 0.45,
          conformity: companionIds.length > 0 ? 0.65 : 0.45,
          reactionStyle,
          likelyNextActions: buildLikelyNextActions(archetype, person.apparentActivity),
          confidence: clamp(person.confidence, 0.35, 0.9),
        },
        locomotion: {
          speed: person.pose === "sitting" ? 0 : 0.8,
          maxSpeed: 1.4,
          acceleration: 0.8,
          isMoving: person.pose === "walking",
          isBlocked: false,
          stuckTickCount: 0,
        },
        runtime: {
          position,
          velocity: { x: 0, y: 0, z: 0 },
          heading: 0,
          currentPath: [],
          animationState: person.pose === "sitting" ? "sit" : person.pose === "walking" ? "walk" : "idle",
          blocked: false,
          lastDecisionAt: 0,
          nextMindRefreshAt: 5000,
          goalStartedAt: 0,
          goalChangedCount: 0,
          lastInteractionAt: null,
          lastInteractionPartnerId: null,
          activeInteractionId: null,
          occupyingObjectId: seatTarget?.id ?? null,
          occupyingZoneId: zoneMatch?.id ?? null,
          queuePosition: null,
          queueTargetZoneId: null,
          recentEvents: [],
        },
      };
    },
  );

  const targetAgentCount = targetAgentCountForDensity(
    videoAnalysis.sceneContext.crowdDensity,
    agents.length,
    semanticZones,
  );
  const syntheticAgentCount = Math.max(0, targetAgentCount - agents.length);

  if (syntheticAgentCount > 0 && agents.length > 0) {
    const candidateZones = semanticZones.filter((zone) =>
      zone.type === "seating" ||
      zone.type === "standing" ||
      zone.type === "circulation" ||
      zone.type === "waiting" ||
      zone.type === "service" ||
      zone.type === "unknown",
    );
    const activeZones = candidateZones.length > 0 ? candidateZones : semanticZones;

    // Weight zones by capacity so agents spread proportionally
    const zoneWeights = activeZones.map((z) => Math.max(z.capacity ?? 2, 2));
    const totalWeight = zoneWeights.reduce((a, b) => a + b, 0);
    const zoneSlotLimits = activeZones.map((_, i) =>
      Math.max(1, Math.round((zoneWeights[i] / totalWeight) * syntheticAgentCount)),
    );

    const syntheticSlotsByZone = new Map<string, number>();
    const occupiedObjectIds = new Set(
      agents
        .map((agent) => agent.runtime.occupyingObjectId)
        .filter((objectId): objectId is string => objectId !== null),
    );

    // Pick zone round-robin but respect capacity proportions
    let zonePointer = 0;
    const pickNextZone = (): SemanticZoneModel => {
      for (let attempts = 0; attempts < activeZones.length; attempts++) {
        const idx = (zonePointer + attempts) % activeZones.length;
        const used = syntheticSlotsByZone.get(activeZones[idx].id) ?? 0;
        if (used < zoneSlotLimits[idx]) {
          zonePointer = (idx + 1) % activeZones.length;
          return activeZones[idx];
        }
      }
      zonePointer = (zonePointer + 1) % activeZones.length;
      return activeZones[zonePointer];
    };

    const paletteLen = Math.max(styleExtraction.dominantPalette.length, 1);

    for (let syntheticIndex = 0; syntheticIndex < syntheticAgentCount; syntheticIndex++) {
      const template = agents[syntheticIndex % agents.length];
      const zone = pickNextZone();
      const zoneSlot = syntheticSlotsByZone.get(zone.id) ?? 0;
      syntheticSlotsByZone.set(zone.id, zoneSlot + 1);

      const preferredPose: AgentModel["visual"]["initialPose"] =
        zone.type === "seating"
          ? "sitting"
          : zone.type === "circulation"
            ? syntheticIndex % 3 === 0 ? "walking" : syntheticIndex % 3 === 1 ? "standing" : "walking"
            : zone.type === "waiting"
              ? syntheticIndex % 3 === 0 ? "walking" : "standing"
              : "standing";
      const seatObject =
        preferredPose === "sitting"
          ? objects.find(
              (object) =>
                (object.type === "chair" || object.type === "sofa") &&
                !occupiedObjectIds.has(object.id),
            )
          : undefined;
      const position = seatObject
        ? { x: seatObject.position.x, y: 0, z: seatObject.position.z }
        : samplePositionInPolygon(
            zone.polygon,
            zoneSlot,
            Math.max(zone.capacity ?? syntheticAgentCount + 1, syntheticAgentCount + 1),
          );
      const id = toAgentId(videoAnalysis.persons.length + syntheticIndex);
      const archetype = inferSyntheticArchetype(zone.type, preferredPose);
      const currentIntent = buildSyntheticActivity(zone.type, preferredPose);

      // Vary clothing from palette — cycle through different palette indices for top/bottom/accent
      const topColor =
        styleExtraction.dominantPalette[(syntheticIndex * 2 + 1) % paletteLen] ??
        template.visual.clothingColors.top;
      const bottomColor =
        styleExtraction.dominantPalette[(syntheticIndex * 2) % paletteLen] ??
        template.visual.clothingColors.bottom;
      const accentColor =
        styleExtraction.dominantPalette[(syntheticIndex + 3) % paletteLen] ??
        template.visual.clothingColors.accent;

      // Vary demographics across synthetic agents
      const syntheticGender = GENDERS[syntheticIndex % GENDERS.length];
      const syntheticBodyType = BODY_TYPES[syntheticIndex % BODY_TYPES.length];
      const syntheticHeightBucket = HEIGHT_BUCKETS[syntheticIndex % HEIGHT_BUCKETS.length];

      if (seatObject) {
        occupiedObjectIds.add(seatObject.id);
      }

      zone.occupantIds = uniqueStrings([...zone.occupantIds, id]);

      agents.push({
        id,
        visual: {
          assetId: `char_${id}`,
          gender: syntheticGender,
          ageGroup: template.visual.ageGroup,
          bodyType: syntheticBodyType,
          heightBucket: syntheticHeightBucket,
          clothingColors: {
            top: topColor,
            bottom: bottomColor,
            accent: accentColor,
          },
          clothingStyle: template.visual.clothingStyle,
          hairColor: template.visual.hairColor,
          hairLength: HAIR_LENGTHS[syntheticIndex % HAIR_LENGTHS.length],
          props: preferredPose === "sitting" ? template.visual.props : [],
          initialPose: preferredPose,
          spatialEstimate: {
            position3d: position,
            confidence3d: 0.3,
            projectionSource: "heuristic_2d",
            videoBoundingBox: template.visual.spatialEstimate.videoBoundingBox,
          },
        },
        social: {
          companionIds: [],
          likelyRelationships: [],
          followTendency: 0.15,
          sociability: zone.type === "circulation" ? 0.35 : 0.5,
          interactionCooldownSec: 10,
        },
        mind: {
          archetype,
          primaryGoal:
            preferredPose === "sitting"
              ? {
                  type: "stay_put",
                  targetObjectId: seatObject?.id,
                  targetZoneId: zone.id,
                  urgency: 0.2,
                  ttlSec: 45,
                }
              : zone.type === "circulation"
                ? {
                    type: "wander",
                    targetZoneId: zone.id,
                    urgency: 0.35,
                    ttlSec: 30,
                  }
                : {
                    type: "find_seat",
                    targetZoneId: zone.id,
                    targetObjectId: seatObject?.id,
                    urgency: 0.4,
                    ttlSec: 30,
                  },
          currentIntent,
          arousal: 0.45,
          patience: preferredPose === "sitting" ? 0.7 : 0.55,
          curiosity: zone.type === "circulation" ? 0.65 : 0.4,
          conformity: 0.5,
          reactionStyle:
            archetype === "staff"
              ? "goal_directed"
              : preferredPose === "walking"
                ? "hesitant"
                : "calm",
          likelyNextActions: buildLikelyNextActions(archetype, currentIntent),
          confidence: 0.25,
        },
        locomotion: {
          speed: preferredPose === "walking" ? 0.8 : 0,
          maxSpeed: 1.4,
          acceleration: 0.8,
          isMoving: preferredPose === "walking",
          isBlocked: false,
          stuckTickCount: 0,
        },
        runtime: {
          position,
          velocity: { x: 0, y: 0, z: 0 },
          heading: 0,
          currentPath: [],
          animationState:
            preferredPose === "sitting"
              ? "sit"
              : preferredPose === "walking"
                ? "walk"
                : "idle",
          blocked: false,
          lastDecisionAt: 0,
          nextMindRefreshAt: 5000,
          goalStartedAt: 0,
          goalChangedCount: 0,
          lastInteractionAt: null,
          lastInteractionPartnerId: null,
          activeInteractionId: null,
          occupyingObjectId: seatObject?.id ?? null,
          occupyingZoneId: zone.id,
          queuePosition: null,
          queueTargetZoneId: null,
          recentEvents: [],
        },
      });
    }
  }

  for (const object of objects) {
    const nearestOccupant = agents.find(
      (agent) => agent.runtime.occupyingObjectId === object.id,
    );
    if (nearestOccupant) {
      object.occupiedByAgentId = nearestOccupant.id;
    }
  }

  const confidences = [
    ...videoAnalysis.objects.map((object) => object.confidence),
    ...videoAnalysis.persons.map((person) => person.confidence),
  ];
  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
      : 0.45;

  return {
    sceneId,
    sourceVideo: {
      durationSec: videoDurationSec ?? 10,
      width: 1920,
      height: 1080,
      fpsSampled: 2,
    },
    sceneContext: {
      estimatedLocation: {
        type: videoAnalysis.sceneContext.locationType,
        regionHint: videoAnalysis.sceneContext.regionHint,
        venueTypeHint: videoAnalysis.sceneContext.venueTypeHint,
        culturalCues: videoAnalysis.sceneContext.culturalCues,
      },
      estimatedTime: {
        timeOfDay: videoAnalysis.sceneContext.timeOfDay,
        dayTypeHint: videoAnalysis.sceneContext.dayTypeHint,
        seasonHint: videoAnalysis.sceneContext.seasonHint,
        lightingEvidence: videoAnalysis.sceneContext.lightingEvidence,
      },
      globalSummary: videoAnalysis.sceneContext.globalSummary,
      crowdDensity: videoAnalysis.sceneContext.crowdDensity,
      dominantActivity: videoAnalysis.sceneContext.dominantActivity,
    },
    environment: {
      spaceType: videoAnalysis.spaceType,
      bounds,
      floorPlan,
      walkableZones: [floorPlan],
      blockedZones,
      entrances,
      exits,
      objects,
      semanticZones,
      navigationGraph: {
        nodes: navNodes,
        edges: navEdges,
      },
    },
    agents,
    simulationConfig: {
      tickIntervalMs: 150,
      maxAgents: Math.max(25, agents.length),
      pathfindingAlgorithm: "astar",
      collisionAvoidanceRadius: 0.5,
      cognitiveUpdateWindowSec: 3,
      maxCognitiveUpdatesPerWindow: 3,
      microBehaviorChancePerTick: 0.05,
      goalTtlDefaultSec: 30,
      stuckTickThreshold: 5,
    },
    style: {
      environmentPalette: {
        wallPrimary: styleExtraction.environmentPalette.wallPrimary,
        wallSecondary: styleExtraction.environmentPalette.wallSecondary,
        floor: styleExtraction.environmentPalette.floor,
        accent: styleExtraction.environmentPalette.accent,
        lightingMood: styleExtraction.environmentPalette.lightingMood,
        lightingDirection: styleExtraction.lightingDirection,
        overallWarmth: styleExtraction.overallWarmth,
        floorMaterial: styleExtraction.floorMaterial,
        wallMaterial: styleExtraction.wallMaterial,
      },
      dominantPalette: styleExtraction.dominantPalette,
      objectOverrides: styleExtraction.objectColors.map((entry) => ({
        objectId: `obj_${entry.objectIndex + 1}`,
        primaryColor: entry.primaryColor,
        secondaryColor: entry.secondaryColor,
      })),
      agentStyleOverrides: styleExtraction.personClothingColors.map((entry) => ({
        agentId: toAgentId(entry.personIndex),
        topColor: entry.topColor,
        bottomColor: entry.bottomColor,
        accentColor: entry.accentColor,
      })),
    },
    assets: {
      roomShell: "parametric",
      furniture: objects.map((object) => ({
        objectId: object.id,
        assetPath: "parametric",
      })),
      characters: [],
    },
    compileMetadata: {
      sceneConfidence: clamp(averageConfidence, 0.45, 0.8),
      geminiModel: "gemini-3.1-flash-lite-preview",
      uncertainty: uniqueStrings([
        reason,
        ...(syntheticAgentCount > 0 ? [`synthetic_background_agents_added:${syntheticAgentCount}`] : []),
        ...(additionalFurniture.length > 0 ? [`synthetic_furniture_infill:${additionalFurniture.length}`] : []),
      ]),
    },
  };
}

function shouldUseHeuristicFallback(
  scene: CompiledScenePackage,
  videoAnalysis: VideoAnalysisOutput,
): boolean {
  const missingAgents = videoAnalysis.persons.length > 0 && scene.agents.length === 0;
  const missingObjects = videoAnalysis.objects.length > 0 && scene.environment.objects.length === 0;
  const missingNav = scene.agents.length > 0 && scene.environment.navigationGraph.nodes.length === 0;
  return missingAgents || missingObjects || missingNav;
}

/**
 * Run the structuring step using Gemini 3.1 Flash-Lite Preview.
 *
 * Takes the raw video analysis and style extraction outputs, constructs
 * a detailed prompt, and asks the model to produce a CompiledScenePackage.
 *
 * Uses up to MAX_RETRIES retries with error-aware re-prompting: if a
 * Zod validation error occurs, the error details are included in the
 * retry prompt so the model can correct its output.
 */
export async function runStructuring(
  videoAnalysis: VideoAnalysisOutput,
  styleExtraction: StyleExtractionOutput,
  sceneId: string,
  videoDurationSec?: number,
): Promise<CompiledScenePackage> {
  let lastError: Error | null = null;
  const baselineScene = buildHeuristicFallbackScene(
    videoAnalysis,
    styleExtraction,
    sceneId,
    videoDurationSec,
    "structuring_normalization_baseline",
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const basePrompt = buildStructuringPrompt(
        JSON.stringify(videoAnalysis, null, 2),
        JSON.stringify(styleExtraction, null, 2),
        sceneId,
        videoDurationSec,
      );

      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\n## RETRY NOTICE (Attempt ${attempt + 1}/${MAX_RETRIES + 1})\nYour previous response failed schema validation. The specific errors were:\n\`\`\`\n${lastError?.message}\n\`\`\`\n\nPlease carefully review the error, fix the JSON structure, and return a valid CompiledScenePackage. Common issues:\n- Missing required fields\n- Wrong enum values (check the exact allowed values)\n- Number fields that should be strings or vice versa\n- Agent IDs must be "a01", "a02" format\n- Object IDs must be "obj_1", "obj_2" format\n- Zone IDs must start with "zone_"\n- projectionSource must be "heuristic_2d"\n- All positions must have x, y, z (y-up coordinate system)`;

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini structuring");
      }

      const parsed = JSON.parse(text);
      const cleaned = stripNulls(parsed);
      const interpreted = StructuringInterpretationOutputSchema.safeParse(cleaned);
      const interpretationPayload = interpreted.success ? interpreted.data : cleaned;
      const validated = CompiledScenePackageSchema.parse(
        normalizeStructuredSceneCandidate(interpretationPayload, baselineScene),
      );

      if (shouldUseHeuristicFallback(validated, videoAnalysis)) {
        console.warn(
          "Structuring returned an underpopulated scene, replacing it with heuristic fallback data",
        );
        return buildHeuristicFallbackScene(
          videoAnalysis,
          styleExtraction,
          sceneId,
          videoDurationSec,
          "structuring_underpopulated_scene_replaced",
        );
      }

      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `Structuring attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );

      if (attempt === MAX_RETRIES) {
        console.warn("Structuring exhausted retries, returning raw analysis with minimal structuring");
        return buildHeuristicFallbackScene(
          videoAnalysis,
          styleExtraction,
          sceneId,
          videoDurationSec,
          "structuring_fallback_from_raw_analysis",
        );
      }
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Structuring failed unexpectedly");
}
