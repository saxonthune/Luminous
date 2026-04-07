export interface NodeLink {
  id: string;
  leader: string;
  follower: string;
}

export type FollowerDragDecision = 'allow' | 'block' | 'redirect-to-leader';

export interface UseNodeLinksOptions {
  links: NodeLink[];
  onFollowerDragAttempt?: (link: NodeLink, followerId: string) => FollowerDragDecision;
}

export interface UseNodeLinksResult {
  getFollowers: (leaderId: string) => string[];
  isFollower: (nodeId: string) => boolean;
  checkFollowerDrag: (nodeId: string) => FollowerDragDecision;
  getLeader: (followerId: string) => string | undefined;
}

export function useNodeLinks(options: UseNodeLinksOptions): UseNodeLinksResult {
  const { links, onFollowerDragAttempt } = options;

  const leaderToFollowers = new Map<string, string[]>();
  const followerToLink = new Map<string, NodeLink>();

  for (const link of links) {
    const followers = leaderToFollowers.get(link.leader) ?? [];
    followers.push(link.follower);
    leaderToFollowers.set(link.leader, followers);
    followerToLink.set(link.follower, link);
  }

  return {
    getFollowers: (leaderId: string) => leaderToFollowers.get(leaderId) ?? [],
    isFollower: (nodeId: string) => followerToLink.has(nodeId),
    checkFollowerDrag: (nodeId: string) => {
      const link = followerToLink.get(nodeId);
      if (!link) return 'allow';
      return onFollowerDragAttempt ? onFollowerDragAttempt(link, nodeId) : 'allow';
    },
    getLeader: (followerId: string) => followerToLink.get(followerId)?.leader,
  };
}
