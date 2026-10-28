export function findPodiumTie(leaders) {
  for (let i = 0; i < Math.min(3, leaders.length - 1); i++) {
    if (leaders[i].score === leaders[i + 1].score && leaders[i].position === leaders[i + 1].position) {
      let start = i;
      while (start > 0 && leaders[start - 1].score === leaders[i].score && leaders[start - 1].position === leaders[i].position) start--;
      let endIndex = i + 1;
      while (endIndex + 1 < leaders.length && leaders[endIndex + 1].score === leaders[i].score && leaders[endIndex + 1].position === leaders[i].position) endIndex++;
      return { start: start + 1, end: Math.min(3, endIndex + 1), members: leaders.slice(start, endIndex + 1) };
    }
  }
  return null;
}

export function splitTiebreakGroup(group, members, correctByParticipant) {
  if (members.some(({ participant_id }) => !correctByParticipant.has(participant_id))) return null;
  const winners = members.filter(({ participant_id }) => correctByParticipant.get(participant_id) === 1);
  const losers = members.filter(({ participant_id }) => correctByParticipant.get(participant_id) === 0);
  if (!winners.length || !losers.length) return null;
  const partitions = [
    { members: winners, start: group.position_start, end: Math.min(group.position_end, group.position_start + winners.length - 1) },
    { members: losers, start: group.position_start + winners.length, end: group.position_end }
  ];
  return partitions;
}

export function shouldAwardPoints(isTiebreak, isCorrect) {
  return isTiebreak ? 0 : Number(Boolean(isCorrect));
}

export function partitionNeedsAnotherRound(partition) {
  return partition.start <= 3 && partition.start <= partition.end && partition.members.length > 1;
}

export function canFinishGame({ closedRegular, roundSize, pendingQuestion, activePodiumGroup, podiumTie }) {
  return closedRegular >= roundSize && !pendingQuestion && !activePodiumGroup && !podiumTie;
}
