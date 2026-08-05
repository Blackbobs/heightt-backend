import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { EventService, SystemEvents } from '../../events/event.service';
import {
  CreateElectionDto,
  UpdateElectionDto,
  NominateCandidateDto,
  CastVoteDto,
  CreateCommitteeDto,
  CreateExecutiveTermDto,
} from './dto';

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly eventService: EventService,
  ) {}

  // ============================================
  // ELECTION MANAGEMENT
  // ============================================

  async createElection(userId: string, dto: CreateElectionDto) {
    this.logger.log(`Creating election: ${dto.title}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: dto.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to create elections',
      );
    }

    const election = await this.prisma.$transaction(async (tx) => {
      const newElection = await tx.election.create({
        data: {
          organizationId: dto.organizationId,
          title: dto.title,
          description: dto.description,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: (dto.status || 'DRAFT') as any,
        },
      });

      // Create positions
      for (const pos of dto.positions) {
        await tx.electionPosition.create({
          data: {
            electionId: newElection.id,
            title: pos.title,
            description: pos.description,
            maxCandidates: pos.maxCandidates || 3,
            maxVotes: pos.maxVotes || 1,
            order: pos.order || 0,
          },
        });
      }

      return newElection;
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ELECTION_CREATED',
        details: JSON.stringify({
          electionId: election.id,
          title: election.title,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.logger.log(`Election created: ${election.id}`);
    return election;
  }

  async getElections(
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
    filters?: { status?: string },
  ) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const skip = (page - 1) * limit;
    const [elections, total] = await Promise.all([
      this.prisma.election.findMany({
        where,
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          positions: {
            include: {
              candidates: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      username: true,
                      profile: true,
                    },
                  },
                  votes: true,
                },
              },
            },
          },
          votes: true,
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.election.count({ where }),
    ]);

    return {
      data: elections,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getElectionById(id: string) {
    const cacheKey = `election:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const election = await this.prisma.election.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        positions: {
          include: {
            candidates: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    username: true,
                    profile: true,
                  },
                },
                votes: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        votes: true,
      },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    await this.cacheService.set(cacheKey, election, 300);
    return election;
  }

  async updateElection(id: string, userId: string, dto: UpdateElectionDto) {
    this.logger.log(`Updating election: ${id}`);

    const election = await this.prisma.election.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: election.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to update this election',
      );
    }

    // Don't allow updates if election is active or completed
    if (election.status === 'ACTIVE' || election.status === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot update an active or completed election',
      );
    }

    const updated = await this.prisma.election.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status as any,
      },
    });

    await this.cacheService.delete(`election:${id}`);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ELECTION_UPDATED',
        details: JSON.stringify({
          electionId: id,
          changes: dto,
        }),
      },
    });

    this.logger.log(`Election updated: ${id}`);
    return updated;
  }

  async startElection(id: string, userId: string) {
    this.logger.log(`Starting election: ${id}`);

    const election = await this.prisma.election.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: election.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to start this election',
      );
    }

    if (election.status === 'ACTIVE') {
      throw new BadRequestException('Election is already active');
    }

    if (election.status === 'COMPLETED') {
      throw new BadRequestException('Election is already completed');
    }

    // Check if there are candidates
    const candidates = await this.prisma.candidate.count({
      where: { electionId: id },
    });

    if (candidates === 0) {
      throw new BadRequestException('Cannot start election with no candidates');
    }

    const updated = await this.prisma.election.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });

    await this.cacheService.delete(`election:${id}`);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ELECTION_STARTED',
        details: JSON.stringify({
          electionId: id,
          title: election.title,
        }),
      },
    });

    this.logger.log(`Election started: ${id}`);
    return updated;
  }

  async endElection(id: string, userId: string) {
    this.logger.log(`Ending election: ${id}`);

    const election = await this.prisma.election.findUnique({
      where: { id },
      include: { organization: true },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: election.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to end this election',
      );
    }

    if (election.status === 'COMPLETED') {
      throw new BadRequestException('Election is already completed');
    }

    const updated = await this.prisma.election.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endDate: new Date(),
      },
    });

    await this.cacheService.delete(`election:${id}`);

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'ELECTION_ENDED',
        details: JSON.stringify({
          electionId: id,
          title: election.title,
        }),
      },
    });

    this.logger.log(`Election ended: ${id}`);
    return updated;
  }

  // ============================================
  // CANDIDATE MANAGEMENT
  // ============================================

  async nominateCandidate(userId: string, dto: NominateCandidateDto) {
    this.logger.log(`Nominating candidate for position: ${dto.positionId}`);

    const position = await this.prisma.electionPosition.findUnique({
      where: { id: dto.positionId },
      include: {
        election: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    const election = position.election;

    // Check if election is in nomination phase
    if (election.status !== 'DRAFT' && election.status !== 'NOMINATION') {
      throw new BadRequestException(
        'Nominations are not open for this election',
      );
    }

    // Check if candidate is already nominated for this position
    const existing = await this.prisma.candidate.findFirst({
      where: {
        positionId: dto.positionId,
        userId: dto.userId,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Candidate already nominated for this position',
      );
    }

    // Check if maximum candidates reached
    const candidateCount = await this.prisma.candidate.count({
      where: { positionId: dto.positionId },
    });

    if (candidateCount >= position.maxCandidates) {
      throw new BadRequestException(
        'Maximum number of candidates reached for this position',
      );
    }

    // Check if user is a member of the organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: dto.userId,
        organizationId: election.organizationId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Candidate must be a member of the organization',
      );
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        electionId: election.id,
        positionId: dto.positionId,
        userId: dto.userId,
        manifesto: dto.manifesto,
        photo: dto.photo,
        status: 'NOMINATED',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            profile: true,
          },
        },
        position: true,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'CANDIDATE_NOMINATED',
        details: JSON.stringify({
          candidateId: candidate.id,
          positionId: dto.positionId,
          electionId: election.id,
        }),
      },
    });

    this.logger.log(`Candidate nominated: ${candidate.id}`);
    return candidate;
  }

  async approveCandidate(candidateId: string, userId: string) {
    this.logger.log(`Approving candidate: ${candidateId}`);

    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        election: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: candidate.election.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to approve candidates',
      );
    }

    const updated = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: 'APPROVED',
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'CANDIDATE_APPROVED',
        details: JSON.stringify({
          candidateId,
          electionId: candidate.electionId,
        }),
      },
    });

    this.logger.log(`Candidate approved: ${candidateId}`);
    return updated;
  }

  // ============================================
  // VOTING SYSTEM (WITH VOTER ELIGIBILITY CHECK)
  // ============================================

  async castVote(userId: string, dto: CastVoteDto) {
    this.logger.log(`Casting vote for election: ${dto.electionId}`);

    const election = await this.prisma.election.findUnique({
      where: { id: dto.electionId },
      include: {
        organization: true,
        positions: {
          include: {
            candidates: true,
          },
        },
      },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    // Check if election is active
    if (election.status !== 'ACTIVE') {
      throw new BadRequestException('Election is not active');
    }

    // Check if election has ended
    if (new Date() > election.endDate) {
      throw new BadRequestException('Election has ended');
    }

    // VOTER ELIGIBILITY CHECK: Check if user is a member of the organization
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: election.organizationId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You must be a member of the organization to vote',
      );
    }

    // Check if user already voted in this election
    const existingVote = await this.prisma.vote.findFirst({
      where: {
        electionId: dto.electionId,
        voterId: userId,
      },
    });

    if (existingVote) {
      throw new ConflictException('You have already voted in this election');
    }

    // Use transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      const createdVotes: any[] = [];

      for (const vote of dto.votes) {
        // Validate position exists in this election
        const position = election.positions.find(
          (p) => p.id === vote.positionId,
        );
        if (!position) {
          throw new BadRequestException(
            `Position ${vote.positionId} not found in this election`,
          );
        }

        // Validate candidate exists for this position
        const candidate = position.candidates.find(
          (c) => c.id === vote.candidateId,
        );
        if (!candidate) {
          throw new BadRequestException(
            `Candidate ${vote.candidateId} not found for position ${position.id}`,
          );
        }

        // Check if user has already voted for this position
        const existingPositionVote = await tx.vote.findFirst({
          where: {
            electionId: dto.electionId,
            voterId: userId,
            candidate: {
              positionId: vote.positionId,
            },
          },
        });

        if (existingPositionVote) {
          throw new ConflictException(
            `You have already voted for position ${position.title}`,
          );
        }

        // Check max votes for this position
        const votesForPosition = await tx.vote.count({
          where: {
            electionId: dto.electionId,
            voterId: userId,
            candidate: {
              positionId: vote.positionId,
            },
          },
        });

        if (votesForPosition >= position.maxVotes) {
          throw new BadRequestException(
            `You have reached the maximum votes for position ${position.title}`,
          );
        }

        // Create the vote
        const newVote = await tx.vote.create({
          data: {
            electionId: dto.electionId,
            candidateId: vote.candidateId,
            voterId: userId,
          },
        });

        createdVotes.push(newVote);
      }

      return createdVotes;
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'VOTE_CAST',
        details: JSON.stringify({
          electionId: dto.electionId,
          voteCount: result.length,
        }),
      },
    });

    this.logger.log(`Vote cast for election: ${dto.electionId}`);
    return {
      message: 'Vote cast successfully',
      votes: result.length,
    };
  }

  async getElectionResults(electionId: string) {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        positions: {
          include: {
            candidates: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: true,
                  },
                },
                votes: true,
              },
            },
          },
        },
        votes: true,
      },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    // Calculate total voters (unique voters)
    const uniqueVoters = new Set(election.votes.map((v) => v.voterId));

    // Calculate results for each position
    const results = election.positions.map((position) => {
      const totalVotes = position.candidates.reduce(
        (sum, c) => sum + c.votes.length,
        0,
      );

      return {
        positionId: position.id,
        positionTitle: position.title,
        candidates: position.candidates.map((candidate) => ({
          candidateId: candidate.id,
          userId: candidate.userId,
          username: candidate.user?.username || 'Unknown',
          votes: candidate.votes.length,
          percentage:
            totalVotes > 0 ? (candidate.votes.length / totalVotes) * 100 : 0,
          manifesto: candidate.manifesto,
          status: candidate.status,
        })),
        totalVotes,
      };
    });

    return {
      electionId: election.id,
      title: election.title,
      organization: election.organization,
      status: election.status,
      startDate: election.startDate,
      endDate: election.endDate,
      totalVoters: uniqueVoters.size,
      positions: results,
    };
  }

  // ============================================
  // COMMITTEE MANAGEMENT
  // ============================================

  async createCommittee(userId: string, dto: CreateCommitteeDto) {
    this.logger.log(`Creating committee: ${dto.name}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: dto.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to create committees',
      );
    }

    const committee = await this.prisma.committee.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        purpose: dto.purpose,
        status: (dto.status || 'ACTIVE') as any,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'COMMITTEE_CREATED',
        details: JSON.stringify({
          committeeId: committee.id,
          name: committee.name,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.logger.log(`Committee created: ${committee.id}`);
    return committee;
  }

  async getCommittees(
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const skip = (page - 1) * limit;
    const [committees, total] = await Promise.all([
      this.prisma.committee.findMany({
        where,
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.committee.count({ where }),
    ]);

    return {
      data: committees,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // EXECUTIVE TERM MANAGEMENT
  // ============================================

  async createExecutiveTerm(userId: string, dto: CreateExecutiveTermDto) {
    this.logger.log(`Creating executive term: ${dto.title}`);

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has permission
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: dto.organizationId,
        membershipType: { in: ['ADMIN', 'STAFF'] },
        status: 'ACTIVE',
      },
    });

    const isPlatformAdmin = await this.prisma.admin.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        adminType: 'PLATFORM_ADMIN',
      },
    });

    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException(
        'You do not have permission to create executive terms',
      );
    }

    const term = await this.prisma.$transaction(async (tx) => {
      const newTerm = await tx.executiveTerm.create({
        data: {
          organizationId: dto.organizationId,
          title: dto.title,
          description: dto.description,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: (dto.status || 'UPCOMING') as any,
        },
      });

      // Add members
      for (const member of dto.members) {
        await tx.executiveMember.create({
          data: {
            termId: newTerm.id,
            userId: member.userId,
            roleId: member.roleId,
            assignedAt: new Date(),
          },
        });
      }

      return newTerm;
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        activity: 'EXECUTIVE_TERM_CREATED',
        details: JSON.stringify({
          termId: term.id,
          title: term.title,
          organizationId: dto.organizationId,
        }),
      },
    });

    this.logger.log(`Executive term created: ${term.id}`);
    return term;
  }

  async getExecutiveTerms(
    organizationId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const skip = (page - 1) * limit;
    const [terms, total] = await Promise.all([
      this.prisma.executiveTerm.findMany({
        where,
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  profile: true,
                },
              },
              role: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.executiveTerm.count({ where }),
    ]);

    return {
      data: terms,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  async invalidateGovernanceCache(organizationId?: string): Promise<void> {
    try {
      // Invalidate all governance tags
      await this.cacheService.invalidateByTag('governance');
      await this.cacheService.invalidateByTag('elections');
      await this.cacheService.invalidateByTag('committees');
      await this.cacheService.invalidateByTag('executive');
      await this.cacheService.invalidateByTag('stats');
      await this.cacheService.invalidateByTag('results');
      await this.cacheService.invalidateByTag('candidates');
      await this.cacheService.invalidateByTag('votes');

      if (organizationId) {
        // Invalidate organization-specific governance caches
        await this.cacheService.invalidateByTag(
          `organization:${organizationId}`,
        );
        await this.cacheService.invalidatePattern(
          `elections:${organizationId}:*`,
        );
        await this.cacheService.invalidatePattern(
          `committees:${organizationId}:*`,
        );
        await this.cacheService.invalidatePattern(
          `executive:terms:${organizationId}:*`,
        );
        await this.cacheService.invalidatePattern(
          `governance:stats:${organizationId}:*`,
        );
      }

      // Also invalidate all election and committee patterns
      await this.cacheService.invalidatePattern('election:*');
      await this.cacheService.invalidatePattern('elections:*');
      await this.cacheService.invalidatePattern('committees:*');
      await this.cacheService.invalidatePattern('executive:*');

      this.logger.log(
        `Governance cache invalidated${organizationId ? ` for organization: ${organizationId}` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate governance cache: ${error.message}`,
      );
    }
  }

  // ============================================
  // ELECTION STATS
  // ============================================

  async getElectionStats(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const [total, active, completed, upcoming, totalVotes, totalCandidates] =
      await Promise.all([
        this.prisma.election.count({ where }),
        this.prisma.election.count({ where: { ...where, status: 'ACTIVE' } }),
        this.prisma.election.count({
          where: { ...where, status: 'COMPLETED' },
        }),
        this.prisma.election.count({
          where: {
            ...where,
            status: 'DRAFT',
            startDate: { gt: new Date() },
          },
        }),
        this.prisma.vote.count({
          where: {
            election: where,
          },
        }),
        this.prisma.candidate.count({
          where: {
            election: where,
          },
        }),
      ]);

    return {
      total,
      active,
      completed,
      upcoming,
      totalVotes,
      totalCandidates,
      voterTurnout:
        total > 0 ? Math.round((totalVotes / (total * 10)) * 100) : 0,
    };
  }
}
