import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canFinishGame, findPodiumTie, partitionNeedsAnotherRound, shouldAwardPoints, splitTiebreakGroup } from '../functions/api/_tiebreak.mjs';

const members = (...ids) => ids.map(participant_id => ({ participant_id }));
const results = entries => new Map(Object.entries(entries));

test('1. No tie with a unique high score', () => assert.equal(findPodiumTie([{score: 3}, {score: 2}, {score: 1}]), null));
test('2. Two tied first place answers correct continue together', () => assert.equal(splitTiebreakGroup({position_start: 1,position_end: 3}, members('A','B'), results({A:1,B:1})), null));
test('3. Two tied players both wrong continue together', () => assert.equal(splitTiebreakGroup({position_start: 1,position_end: 3}, members('A','B'), results({A:0,B:0})), null));
test('4. One correct and one wrong resolves the dispute', () => assert.deepEqual(splitTiebreakGroup({position_start: 1,position_end: 3}, members('A','B'), results({A:1,B:0})).map(x => [x.start,x.end]), [[1,1],[2,3]]));
test('5. Four tied players split into correct and incorrect groups', () => assert.deepEqual(splitTiebreakGroup({position_start: 1,position_end: 3}, members('A','B','C','D'), results({A:1,B:1,C:0,D:0})).map(x => [x.members.map(m => m.participant_id),x.start,x.end]), [[['A','B'],1,2],[['C','D'],3,3]]));
test('5b. Fifty tied players only create groups for first, second and third', () => {
  const ids = Array.from({length:50}, (_, i) => `P${i}`);
  const outcomes = new Map(ids.map((id, i) => [id, i < 2 ? 1 : 0]));
  const groups = splitTiebreakGroup({position_start:1,position_end:3}, members(...ids), outcomes);
  assert.deepEqual(groups.map(group => [group.members.length,group.start,group.end]), [[2,1,2],[48,3,3]]);
  const tie = findPodiumTie(ids.map(id => ({id,score:7})));
  assert.deepEqual([tie.start,tie.end,tie.members.length], [1,3,50]);
});
test('5c. Losers outside the podium are recorded but never receive another round', () => {
  const ids = Array.from({length:50}, (_, i) => `P${i}`);
  const outcomes = new Map(ids.map((id, i) => [id, i < 3 ? 1 : 0]));
  const groups = splitTiebreakGroup({position_start:1,position_end:3}, members(...ids), outcomes);
  assert.deepEqual(groups.map(group => [group.members.length,group.start,group.end]), [[3,1,3],[47,4,3]]);
});
test('5d. With three first-place contenders, a lone loser is recorded third and is not active again', () => {
  const partitions = splitTiebreakGroup({position_start:1,position_end:3}, members('A','B','C'), results({A:1,B:1,C:0}));
  assert.deepEqual(partitions.map(group => [group.members.length,group.start,group.end,partitionNeedsAnotherRound(group)]), [[2,1,2,true],[1,3,3,false]]);
});
test('6. A resolved first-place group does not prevent a separate second-place tie', () => assert.deepEqual(findPodiumTie([{score:4},{score:3},{score:3},{score:1}]).start, 2));
test('7. A third-place tie starts at position three, not first', () => assert.equal(findPodiumTie([{score:4},{score:3},{score:2},{score:2}]).start, 3));
test('8. Ties outside relevant podium positions do not create rounds', () => assert.equal(findPodiumTie([{score:5},{score:4},{score:3},{score:2},{score:2}]), null));
test('9. A tied subgroup of three remains an independent unresolved group', () => assert.equal(splitTiebreakGroup({position_start:1,position_end:3}, members('A','B','C'), results({A:1,B:1,C:1})), null));
test('10. Distinct disputes split independently', () => {
  const first = splitTiebreakGroup({position_start:1,position_end:3}, members('A','B'), results({A:1,B:0}));
  const second = splitTiebreakGroup({position_start:3,position_end:3}, members('C','D'), results({C:0,D:1}));
  assert.deepEqual([first[0].start, second[0].start], [1,3]);
});
test('11. Only the current round result controls advancement', () => assert.deepEqual(splitTiebreakGroup({position_start:1,position_end:3}, members('A','B'), results({A:0,B:1})).map(x => x.members[0].participant_id), ['B','A']));
const migration = readFileSync(new URL('../migrations/0001_tiebreak_groups.sql', import.meta.url), 'utf8');
test('12. Repeated creation is guarded by the database partial unique index', () => assert.match(migration, /CREATE UNIQUE INDEX idx_one_active_tiebreak/));
test('13. Concurrent group creation is guarded by a unique active position', () => assert.match(migration, /idx_active_tiebreak_position/));
test('14. Normal correct answers keep their point', () => assert.equal(shouldAwardPoints(false, 1), 1));
test('15. Tiebreak answers award no normal points', () => assert.equal(shouldAwardPoints(true, 1), 0));
test('16. Missing answers do not eliminate a participant', () => assert.equal(splitTiebreakGroup({position_start:1,position_end:3}, members('A','B'), results({A:1})), null));
test('17. A game cannot finish with any pending tie or question', () => {
  assert.equal(canFinishGame({closedRegular:10,roundSize:10,pendingQuestion:true,activePodiumGroup:false,podiumTie:false}), false);
  assert.equal(canFinishGame({closedRegular:10,roundSize:10,pendingQuestion:false,activePodiumGroup:true,podiumTie:true}), false);
  assert.equal(canFinishGame({closedRegular:10,roundSize:10,pendingQuestion:false,activePodiumGroup:false,podiumTie:false}), true);
});
