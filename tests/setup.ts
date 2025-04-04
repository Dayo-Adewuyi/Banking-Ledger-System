import { MongoMemoryServer } from 'mongodb-memory-server';

// Increase timeout for all tests
jest.setTimeout(30000);

// Global setup for MongoDB memory server
// This can help reduce test flakiness by using an in-memory MongoDB server
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongoServer.getUri();
});

afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});