/**
 * Agent mind initialization prompt for Gemini 3.1 Flash-Lite Preview.
 *
 * For each detected person, infers archetype, goals, trait weights,
 * social links, likely next actions, and reaction style.
 */

/**
 * Build the mind-init prompt for a single agent, given structured scene context.
 */
export function buildMindInitPrompt(
  agentId: string,
  agentJson: string,
  sceneContextJson: string,
  allAgentSummariesJson: string,
  zonesSummaryJson: string,
): string {
  return `You are a behavioral psychologist and crowd simulation expert. Your task is to initialize the cognitive state ("mind") for a single agent in a simulated 3D scene.

## Context

You are working with a scene that has already been analyzed. Below is the relevant context.

### Scene Context
\`\`\`json
${sceneContextJson}
\`\`\`

### All Agents Summary (IDs, positions, archetypes, current poses)
\`\`\`json
${allAgentSummariesJson}
\`\`\`

### Available Zones
\`\`\`json
${zonesSummaryJson}
\`\`\`

### Target Agent (the one you are initializing)
\`\`\`json
${agentJson}
\`\`\`

## Your task

For agent "${agentId}", produce a detailed mind initialization. Consider:

1. **What is this person's role in this scene?** Are they a customer, employee, visitor, passerby? Look at their clothing style, position, pose, and props for clues.

2. **What are they trying to do?** Infer their primary goal from their apparent activity, position, and body language. A person sitting with a laptop is likely working (stay_put). A person standing near the entrance might be waiting (wait_for_someone) or looking for a seat (find_seat). A person at the counter might be ordering (approach_counter).

3. **What might they do next?** Consider secondary goals. A worker might eventually need a coffee break. A person waiting might give up and leave.

4. **What are their personality traits?**
   - arousal (0-1): Energy/alertness level. A focused worker has low arousal (~0.3). Someone anxiously waiting has high arousal (~0.7). Staff tend to be moderate (~0.5).
   - patience (0-1): How long they'll tolerate waiting. Workers and relaxed diners have high patience (~0.8). People in a hurry have low patience (~0.3).
   - curiosity (0-1): Interest in their surroundings. Newcomers and visitors are more curious (~0.7). Regulars and focused workers are less curious (~0.2).
   - conformity (0-1): Tendency to follow social norms. Most people in public spaces are moderate (~0.5-0.7). Independent types who choose unusual seats or stand apart are lower (~0.3).

5. **How do they react to changes?** Choose a reaction style:
   - "calm": Steady, doesn't startle. Good for seated workers, relaxed diners.
   - "hesitant": Uncertain, may freeze before deciding. Good for new visitors, uncertain people.
   - "follow_others": Tends to copy nearby behavior. Good for conformist group members.
   - "goal_directed": Decisive, moves toward objectives. Good for staff, people with clear purpose.
   - "anxious": Heightened alertness, may overreact. Good for rushed people, those who seem uncomfortable.

6. **Social links**: Who do they know in this scene? If they're in a group, link to companions. If they appear to interact with staff, note that relationship. Include:
   - targetAgentId: The other agent's ID
   - relationship: friend, coworker, staff-customer, stranger, or unknown
   - followTendency: 0-1, how likely they are to follow that person's movements

7. **Likely next actions**: Provide 2-5 possible next actions with probabilities summing to approximately 1.0. Be specific and grounded in the scene context. For example:
   - "continue typing on laptop" (0.5)
   - "glance toward counter" (0.2)
   - "check phone" (0.15)
   - "stand up to stretch" (0.1)
   - "walk to counter for refill" (0.05)

## Goal types available

Primary and secondary goals must use one of these types:
- stay_put: Remain in current position (for seated/working people)
- find_seat: Looking for an available seat
- follow_companion: Moving with a group member
- approach_counter: Going to a service counter
- move_to_exit: Heading toward an exit
- wait_for_someone: Waiting in place for a specific person
- wander: Moving around without a specific target
- reposition: Moving to a different spot
- avoid_crowd: Moving away from crowded areas

## Archetype options

Choose the most fitting archetype:
- waiting_guest: Standing/sitting, waiting for service or a companion
- staff: Employee, behind counter or serving
- seated_worker: Working alone at a table with laptop/papers
- late_arrival: Just entered, looking for a spot
- person_leaving: Packing up or heading toward exit
- social_group_member: Part of a conversing group
- uncertain_visitor: New to the space, looking around uncertainly
- unknown: Cannot determine

## Important rules

1. Ground ALL inferences in the visual evidence. Do not invent details not supported by the scene data.
2. Trait values should be plausible and varied — avoid making everyone the same.
3. Probabilities for likelyNextActions must sum to approximately 1.0 (within 0.05 tolerance).
4. If the agent has companions (groupId is set), include social links to each companion.
5. The currentIntent should be a natural, human-readable sentence (e.g., "Finishing up a latte while reviewing emails on laptop").
6. Set confidence lower (0.5-0.7) if the person is partially occluded or their activity is ambiguous.
7. Return valid JSON matching the provided schema exactly.`;
}
