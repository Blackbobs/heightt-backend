import { ForbiddenException } from '@nestjs/common';
import { StudentsController } from './students.controller';

jest.mock('./students.service', () => ({ StudentsService: class {} }));
jest.mock('./promotion.service', () => ({ PromotionService: class {} }));

describe('StudentsController admin student scope', () => {
  const getAllStudents = jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } });
  const controller = Object.assign(Object.create(StudentsController.prototype), {
    logger: { log: jest.fn() },
    studentsService: { getAllStudents },
  }) as StudentsController;

  beforeEach(() => getAllStudents.mockClear());

  it('forces a department admin to their assigned department', async () => {
    await controller.getAllStudents(
      {
        admin: {
          type: 'DEPARTMENT_ADMIN',
          institutionId: 'institution-1',
          facultyId: 'faculty-1',
          departmentId: 'department-1',
        },
      },
      '1',
      '10',
      undefined,
      'institution-2',
      'faculty-2',
      'department-2',
    );

    expect(getAllStudents).toHaveBeenCalledWith(1, 10, {
      organizationId: undefined,
      institutionId: 'institution-1',
      facultyId: 'faculty-1',
      departmentId: 'department-1',
      levelId: undefined,
      academicSessionId: undefined,
      status: undefined,
      verificationStatus: undefined,
      search: undefined,
    });
  });

  it('does not run an unscoped query for a missing assignment', async () => {
    await expect(
      controller.getAllStudents({
        admin: { type: 'DEPARTMENT_ADMIN', institutionId: 'institution-1' },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(getAllStudents).not.toHaveBeenCalled();
  });

  it('uses separate cache entries for different admins', () => {
    const cache = Reflect.getMetadata('cache', controller.getAllStudents);
    const request = (id: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { id }, query: {} }),
      }),
    });

    expect(cache.key(request('admin-1'))).not.toBe(
      cache.key(request('admin-2')),
    );
  });
});
