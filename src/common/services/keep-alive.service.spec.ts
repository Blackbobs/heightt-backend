import axios from 'axios';
import { KeepAliveService } from './keep-alive.service';

jest.mock('axios');

describe('KeepAliveService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not ping the health endpoint outside production', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'APP_URL') return 'http://localhost:3000';
        return fallback;
      }),
    };
    const service = new KeepAliveService(config as any);

    await service.keepAlive();

    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('pings the health endpoint in production', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'APP_URL') return 'https://api.example.com';
        return fallback;
      }),
    };
    mockedAxios.get.mockResolvedValue({ status: 200 } as any);
    const service = new KeepAliveService(config as any);

    await service.keepAlive();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/health',
      expect.objectContaining({ timeout: 10000 }),
    );
  });
});
