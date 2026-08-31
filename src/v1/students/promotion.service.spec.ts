import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PromotionService } from './promotion.service';

describe('PromotionService institution promotion', () => {
  const currentSession = {
    id: 'session-2026',
    institutionId: 'institution-1',
    name: '2026/2027',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2027-07-31T00:00:00.000Z'),
  };

  function setup(
    session: any = currentSession,
    operator: any = { id: 'operator-admin' },
  ) {
    const tx = {
      academicSession: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'session-2027',
          ...data,
        })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentPromotion: { create: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      studentProfile: { update: jest.fn().mockResolvedValue({}) },
      studentAcademicRecord: { upsert: jest.fn().mockResolvedValue({}) },
      admin: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      institution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'institution-1',
          name: 'Heightt University',
        }),
      },
      academicSession: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(session)
          .mockResolvedValueOnce(null),
      },
      admin: {
        findFirst: jest.fn().mockResolvedValue(operator),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'old-admin', userId: 'student-user' }]),
      },
      studentProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'student-300',
            userId: 'student-user',
            departmentId: 'department-1',
            currentAcademicLevelId: 'level-300',
          },
        ]),
      },
      academicLevel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'level-300',
            departmentId: 'department-1',
            name: '300 Level',
            order: 3,
          },
          {
            id: 'level-400',
            departmentId: 'department-1',
            name: '400 Level',
            order: 4,
          },
        ]),
      },
      $transaction: jest.fn((callback: (client: any) => unknown) =>
        callback(tx),
      ),
    };
    const cache = {
      invalidateByTag: jest.fn().mockResolvedValue(undefined),
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      invalidateUserCache: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const service = new PromotionService(
      prisma as any,
      cache as any,
      {} as any,
      notifications as any,
    );
    return { service, prisma, tx, cache, notifications };
  }

  it('creates the next session and promotes 300 level to 400 level', async () => {
    const { service, tx, cache, notifications } = setup();
    const result = await service.promoteInstitution(
      'institution-1',
      'platform-admin',
      { currentSessionId: currentSession.id },
    );

    expect(tx.academicSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '2027/2028',
        institutionId: 'institution-1',
        isCurrent: true,
        status: 'ACTIVE',
      }),
    });
    expect(tx.studentPromotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-300',
        fromLevelId: 'level-300',
        toLevelId: 'level-400',
        sessionId: 'session-2027',
      }),
    });
    expect(tx.studentAcademicRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sessionId: 'session-2027',
          academicLevelId: 'level-400',
        }),
      }),
    );
    expect(tx.admin.updateMany).not.toHaveBeenCalled();
    expect(cache.invalidateUserCache).toHaveBeenCalledWith('student-user');
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'student-user',
      expect.objectContaining({
        title: 'Promotion confirmed',
        sendEmail: true,
        data: expect.objectContaining({
          event: 'STUDENT_PROMOTED',
          previousLevel: '300 Level',
          currentLevel: '400 Level',
          previousSession: '2026/2027',
          currentSession: '2027/2028',
        }),
      }),
    );
    expect(result.currentSession).toEqual({
      id: 'session-2027',
      name: '2027/2028',
      generated: true,
    });
    expect(result.summary.promoted).toBe(1);
  });

  it('notifies final-level students when they are marked as graduated', async () => {
    const { service, prisma, tx, notifications } = setup();
    prisma.studentProfile.findMany.mockResolvedValue([
      {
        id: 'student-400',
        userId: 'final-year-user',
        departmentId: 'department-1',
        currentAcademicLevelId: 'level-400',
      },
    ]);

    const result = await service.promoteInstitution(
      'institution-1',
      'platform-admin',
      { currentSessionId: currentSession.id },
    );

    expect(tx.studentProfile.update).toHaveBeenCalledWith({
      where: { id: 'student-400' },
      data: { academicStatus: 'GRADUATED' },
    });
    expect(tx.studentPromotion.create).not.toHaveBeenCalled();
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'final-year-user',
      expect.objectContaining({
        title: 'Graduation status confirmed',
        sendEmail: true,
        data: expect.objectContaining({
          event: 'STUDENT_GRADUATED',
          previousLevel: '400 Level',
          currentLevel: null,
        }),
      }),
    );
    expect(result.summary.graduated).toBe(1);
  });

  it('rejects a stale current-session ID to prevent double promotion', async () => {
    const { service, prisma } = setup(null);

    await expect(
      service.promoteInstitution('institution-1', 'platform-admin', {
        currentSessionId: 'old-session',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects admins outside the platform or institution scope', async () => {
    const { service, prisma } = setup(currentSession, null);

    await expect(
      service.promoteInstitution('institution-1', 'organization-admin', {
        currentSessionId: currentSession.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed or non-consecutive session names', () => {
    const { service } = setup();
    expect(() => (service as any).getNextSessionName('2026-2027')).toThrow(
      BadRequestException,
    );
    expect(() => (service as any).getNextSessionName('2026/2028')).toThrow(
      BadRequestException,
    );
  });
});
