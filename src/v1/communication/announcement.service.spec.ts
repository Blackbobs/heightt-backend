import { AnnouncementService } from './announcement.service';

describe('AnnouncementService cache invalidation', () => {
  it('invalidates student dashboards when an announcement changes', async () => {
    const cache = {
      invalidateByTag: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AnnouncementService(
      {} as any,
      cache as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.invalidateAnnouncementCache('announcement-1');

    expect(cache.invalidateByTag).toHaveBeenCalledWith('announcements');
    expect(cache.invalidateByTag).toHaveBeenCalledWith('communication');
    expect(cache.invalidateByTag).toHaveBeenCalledWith('dashboard');
  });
});
