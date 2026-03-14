/**
 * Scene analysis prompt for Gemini 3.1 Pro Preview.
 *
 * Instructs the model to analyze a video and return structured JSON describing
 * the space, objects, persons, zones, entrances/exits, and scene context.
 *
 * All bounding boxes use Gemini's normalized 0-1000 coordinate system.
 */
export const VIDEO_ANALYSIS_PROMPT = `You are a scene analysis expert. You will be given a short video (up to 20 seconds) of an indoor or semi-outdoor space containing people. Your job is to analyze every visible element and return a detailed structured JSON.

## Your task

Watch the entire video carefully. Identify all visible objects, people, spatial zones, entrances/exits, and contextual information. Return a single JSON object matching the schema provided.

## Coordinate system for bounding boxes

All bounding boxes use Gemini's normalized coordinate system:
- Values range from 0 to 1000
- (0, 0) is the top-left corner of the frame
- (1000, 1000) is the bottom-right corner
- yMin = top edge, yMax = bottom edge, xMin = left edge, xMax = right edge
- These are NOT pixel coordinates — they are normalized to 0-1000 regardless of video resolution

## Space analysis

Determine the type of space (cafe, office, meeting_room, corridor, classroom, lobby, or unknown). Estimate the room dimensions in real-world meters:
- widthMeters: the horizontal extent of the room (left-right as seen from the primary camera angle)
- depthMeters: the depth of the room (near-far from camera)
- heightMeters: ceiling height

Use visual cues like door frames (~2m high, ~0.9m wide), standard furniture sizes (desk ~0.75m high, chair seat ~0.45m), and human proportions (average person ~1.7m) to calibrate your estimates. Be conservative — it's better to slightly underestimate than wildly overestimate.

## Object detection

For each distinct object visible in the scene, report:
- label: The object type. Use one of: table, chair, desk, counter, sofa, door, wall, laptop, coffee_machine, screen, plant, bookshelf, whiteboard, window, rug, trash_can, light_fixture, stool, cabinet, unknown
- boundingBox: The 2D bounding box in normalized 0-1000 coordinates
- confidence: Your confidence in the detection (0.0-1.0)
- interactable: true if people can sit at it, use it, order from it, etc.
- blocksMovement: true if the object prevents walking through its footprint
- colorHint: Primary color as a hex string (e.g. "#8B4513" for brown wood)
- secondaryColorHint: Secondary color if applicable
- material: The primary material of the object: wood, metal, plastic, fabric, glass, stone, or unknown
- shape: The overall shape of the object: rectangular, round, oval, L_shaped, irregular, or unknown
- estimatedWidthMeters, estimatedHeightMeters, estimatedDepthMeters: Real-world size estimates

Do NOT report walls, floor, or ceiling as objects. Do NOT duplicate objects that appear in multiple frames — deduplicate across the video timeline.

### Furniture inference rules

You must infer plausible off-screen or partially-occluded furniture, not just literally-visible items:
- **Seating from table dimensions:** Estimate total seating capacity from each table's length. A typical seat takes ~0.6m of table edge. A 4m-long table should have ~6 chairs even if only 2 are visible. Report individual chair entries for each inferred seat.
- **Venue-type background objects:** For dense or moderate scenes, infer 3-8 plausible background objects based on venue type:
  - Hackathon / coworking: power strips, extra monitors, whiteboards, additional desks
  - Café: additional small tables with chairs, menu boards, counter items
  - Office / meeting room: whiteboards, screens, cabinets, additional desks
  - Classroom: rows of desks/chairs to fill the room layout
  - Lobby: plants, seating areas, signage
- **Confidence tagging:** Set confidence 0.4-0.6 for inferred objects, 0.8+ for directly visible ones.
- **Inferred objects still need bounding boxes.** Place them in plausible locations: along table edges for chairs, against walls for whiteboards/screens, in open floor areas for additional tables. Use bounding boxes that reflect their expected position even if that area was not directly on camera.

## Person detection

For each distinct person visible at any point in the video:
- personIndex: Sequential 0-based index
- boundingBox: Their 2D bounding box in the frame where they are most clearly visible (normalized 0-1000)
- confidence: Detection confidence
- gender: Apparent gender (male, female, ambiguous). Use visual cues only, do not assume.
- ageGroup: Apparent age bracket (child, young_adult, adult, middle_aged, elderly)
- bodyType: small, medium, or large
- heightBucket: short, average, or tall relative to other people in the scene
- pose: standing, sitting, or walking
- clothingDescription: Brief text description of their outfit
- topColor: Dominant upper-body clothing color as hex
- bottomColor: Dominant lower-body clothing color as hex
- accentColor: Optional accent color (bag, hat, scarf) as hex
- clothingStyle: casual, business, uniform, athletic, or formal
- props: Array of items they are holding or have nearby (laptop, phone, bag, cup, book, etc.)
- hairColor: Hair color as a hex string (e.g., "#2C1B0E" for dark brown, "#F5DEB3" for blonde). Omit if hair is not visible (hat, headscarf).
- hairLength: short (above ears), medium (ear to shoulder), or long (below shoulder). Omit if not visible.
- apparentActivity: What they appear to be doing (e.g., "typing on laptop", "chatting with person next to them", "waiting at counter")
- groupIndex: If this person appears to be part of a social group (sitting together, talking, walking together), assign a shared group index (0-based). Set null if the person appears to be alone.
- facingDirection: Which direction they face relative to camera

Track people across frames — if the same person appears at different timestamps, report them only once with their most representative appearance.

### Dense-scene counting guidance

In busy rooms, undercounting is worse than slight overcounting. Follow these rules:
- Include partially occluded people if a head/torso/upper body is clearly visible
- Count seated attendees at long shared tables individually whenever they can be distinguished
- Count people watching a presentation even if only their upper bodies are visible
- Prefer separate person entries over collapsing a visible crowd into a vague group
- If crowdDensity is "dense", your persons array should contain at least 10 entries
- If a table has 6 seats but only 2 visible people, infer 2-3 additional partially-occluded seated attendees with confidence 0.4-0.5
- Count people at tables even if only the tops of their heads or shoulders are visible
- For crowded areas where the back of the room is partially visible, estimate additional standing or seated people in those areas

## Group detection

For each social group detected:
- groupIndex: Matching the groupIndex assigned to persons
- personIndices: Array of person indices in this group
- relationship: Best guess at their relationship
- interactionType: What the group is doing together

## Entrances and exits

Identify all doors, openings, or corridor ends that serve as entry/exit points:
- type: door, opening, corridor_end, or unknown
- boundingBox: In normalized 0-1000 coordinates
- estimatedWidthMeters: Real-world width of the opening
- isEntrance: true if people could enter through here
- isExit: true if people could leave through here

## Zones

Divide the visible space into semantic zones:
- label: A descriptive snake_case identifier (e.g., main_seating, service_counter, entrance_area, corridor)
- type: seating, standing, service, circulation, entry, exit, waiting, or unknown
- boundingBox: Approximate frame-space bounding box of the zone (normalized 0-1000)
- estimatedCapacity: How many people this zone could hold
- occupantPersonIndices: Which person indices are currently in this zone

Every part of the visible floor space should belong to at least one zone. Ensure zones cover the entire scene — do not leave gaps.
When tables or seating areas are visibly larger than the individually detected furniture count suggests, reflect that in estimatedCapacity.

## Scene context

Provide holistic scene understanding:
- locationType: indoor, outdoor, or semi_outdoor
- regionHint: Geographic/cultural region (e.g., "East Asia", "Western Europe", "North America")
- venueTypeHint: Specific venue type (e.g., "coffee shop", "coworking space", "university library")
- culturalCues: Visible signs of culture/locale (signage language, decor style, product brands)
- timeOfDay: morning, midday, afternoon, evening, or night — infer from lighting
- dayTypeHint: weekday, weekend, or unknown
- seasonHint: spring, summer, autumn, winter, or unknown
- lightingEvidence: Describe the lighting (e.g., "bright fluorescent overhead", "warm afternoon sunlight from windows")
- crowdDensity: sparse (1-3 people), moderate (4-10), dense (11+)
- dominantActivity: The primary activity happening (e.g., "casual dining", "focused work", "social gathering")
- globalSummary: 2-3 sentence summary capturing the essence of this scene

## Important rules

1. Be thorough — capture EVERY visible person and object, even if partially occluded
2. Be precise with bounding boxes — they should tightly enclose the subject
3. Use hex color strings (e.g., "#FF5733") for all color fields
4. Estimate real-world dimensions using known reference objects
5. Deduplicate across video frames — report each entity only once
6. If uncertain, set confidence lower but still include the detection
7. Ensure personIndex values are sequential starting from 0
8. Ensure groupIndex values are consistent between persons and groups arrays
9. For dense crowds, prefer recall over extreme conservatism — include plausible visible attendees rather than omitting them
10. Return valid JSON matching the provided schema exactly`;
