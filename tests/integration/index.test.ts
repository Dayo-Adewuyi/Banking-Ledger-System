import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app';
import User from '../../src/models/user.model';
import Account from '../../src/models/account.model';
import AccountBalance from '../../src/models/accountBalance.model';
import Transaction from '../../src/models/transaction.model';
import { connectDatabase } from '../../src/config/database';
import { UserRole } from '../../src/interfaces/user.interface';
import { AccountType, CurrencyCode } from '../../src/interfaces/account.interface';
import { hashPassword } from '../../src/utils/crypto';

const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/banking-ledger-test';

const testUser = {
  email: 'test@example.com',
  password: 'UserPassword123!',
  firstName: 'Test',
  lastName: 'User'
};

const testAdmin = {
  email: 'admin@example.com',
  password: 'AdminPass123!',
  firstName: 'Admin',
  lastName: 'User',
  role: UserRole.ADMIN
};

let userToken: string;
let adminToken: string;
let userId: string;
let adminId: string;
let accountId: string;
let accountNumber: string;
let transactionId: string;
let verificationToken: string;

// Setup and teardown
beforeAll(async () => {
  // Connect to test database
  await mongoose.disconnect(); // Ensure no existing connections
  mongoose.set('strictQuery', true);

  // Override MongoDB URI with test URI
  process.env.MONGODB_URI = TEST_MONGODB_URI;
  
  await connectDatabase();
  
  // Clear existing test data
  await User.deleteMany({});
  await Account.deleteMany({});
  await AccountBalance.deleteMany({});
  await Transaction.deleteMany({});
});

afterAll(async () => {
  // Clean up and close database connection
  await User.deleteMany({});
  await Account.deleteMany({});
  await AccountBalance.deleteMany({});
  await Transaction.deleteMany({});
  await mongoose.connection.close();
});

describe('Auth Routes', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          confirmPassword: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName
        }).then((res) => {
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id');
            expect(res.body.data.email).toBe(testUser.email);
            verificationToken = res.body.data.token;
            userId = res.body.data.id;
          });
      
    
    });

    it('should register an admin user', async () => {
      const hashedPassword = await hashPassword(testAdmin.password);
      
      const adminUser = new User({
        email: testAdmin.email,
        password: hashedPassword,
        firstName: testAdmin.firstName,
        lastName: testAdmin.lastName,
        role: testAdmin.role,
        status: 'active',
        security: {
          passwordLastChanged: new Date(),
          previousPasswords: [],
          failedLoginAttempts: 0
        },
        notifications: {
          email: true,
          sms: false,
          push: false,
          marketing: false
        }
      });
      
      const savedAdmin = await adminUser.save();
      adminId = savedAdmin._id.toString();

      expect(savedAdmin).toHaveProperty('_id');
      expect(savedAdmin.email).toBe(testAdmin.email);
      expect(savedAdmin.role).toBe(testAdmin.role);
    });

    it('should not register a user with an existing email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          confirmPassword: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName
        });
      
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should not register with password mismatch', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new@example.com',
          password: testUser.password,
          confirmPassword: 'DifferentPassword123!',
          firstName: testUser.firstName,
          lastName: testUser.lastName
        });
      
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

  });
  describe('POST /api/v1/auth//verify-email', () => {
    it('should verify email with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          token: verificationToken
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Email verified successfully');
    });

    it('should not verify email with invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          token: 'INVALID_TOKEN'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  })



  describe('POST /api/v1/auth/login', () => {
    it('should login a user and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('refreshToken');
      
      userToken = res.body.data.token;
    });

 

    it('should not login with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should get current user profile', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.email).toBe(testUser.email);
    });

    it('should not get profile without authentication', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('should change user password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Update the test password for future tests
      testUser.password = 'NewPassword123!';
      
      // Get new token with updated password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      userToken = loginRes.body.data.token;
    });

    it('should not change password with wrong current password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'AnotherPassword123!',
          confirmPassword: 'AnotherPassword123!'
        });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Account Routes', () => {
  describe('POST /api/v1/accounts', () => {
    it('should create a new account for the user', async () => {
      const res = await request(app)
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          accountType: AccountType.SAVINGS,
          currency: CurrencyCode.USD,
          name: 'Test Savings Account',
          initialBalance: 1000
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('accountNumber');
      expect(res.body.data.accountType).toBe(AccountType.SAVINGS);
      expect(res.body.data.currency).toBe(CurrencyCode.USD);
      expect(res.body.data.balance).toBe('1000');
      
      accountId = res.body.data.id;
      accountNumber = res.body.data.accountNumber;
    });

    it('should not create an account without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/accounts')
        .send({
          accountType: AccountType.SAVINGS,
          currency: CurrencyCode.USD,
          name: 'Test Savings Account',
          initialBalance: 1000
        });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/accounts', () => {
    it('should get all accounts for the user', async () => {
      const res = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].accountNumber).toBe(accountNumber);
    });

    it('should support pagination for accounts', async () => {
      const res = await request(app)
        .get('/api/v1/accounts?page=1&limit=10')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
    });
  });

  describe('GET /api/v1/accounts/:id', () => {
    it('should get account by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(accountId);
      expect(res.body.data.accountNumber).toBe(accountNumber);
    });

    it('should not get account with invalid ID', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/609c17fc12345678abcdef01')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/accounts/number/:accountNumber', () => {
    it('should get account by account number', async () => {
      const res = await request(app)
        .get(`/api/v1/accounts/number/${accountNumber}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(accountId);
      expect(res.body.data.accountNumber).toBe(accountNumber);
    });

    it('should not get account with invalid account number', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/number/INVALID-1234-5678-9012')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/accounts/:id/balance', () => {
    it('should get account balance', async () => {
      const res = await request(app)
        .get(`/api/v1/accounts/${accountId}/balance`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('balance');
      expect(res.body.data).toHaveProperty('accountId');
      expect(res.body.data).toHaveProperty('currency');
      expect(res.body.data.accountId).toBe(accountId);
    });
  });

  describe('PATCH /api/v1/accounts/:id', () => {
    it('should update account details', async () => {
      const res = await request(app)
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Updated Savings Account'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(accountId);
      // Check if metadata contains the updated name
      expect(res.body.data.metadata).toHaveProperty('name', 'Updated Savings Account');
    });
  });

  describe('GET /api/v1/accounts/summary', () => {
    it('should get account summary for the user', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/summary')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('accounts');
      expect(res.body.data.summary).toHaveProperty('totalAccounts');
      expect(res.body.data.summary).toHaveProperty('totalBalance');
    });
  });
});

describe('Transaction Routes', () => {
  describe('POST /api/v1/transactions/deposit', () => {
    it('should create a deposit transaction', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          accountNumber: accountNumber,
          amount: 500,
          currency: CurrencyCode.USD,
          description: 'Test deposit'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('transactionId');
      expect(res.body.data.amount).toBe('500');
      expect(res.body.data.currency).toBe(CurrencyCode.USD);
      
      transactionId = res.body.data.transactionId;
    });
  });

  describe('POST /api/v1/transactions/withdrawal', () => {
    it('should create a withdrawal transaction', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdrawal')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          accountNumber: accountNumber,
          amount: 200,
          currency: CurrencyCode.USD,
          description: 'Test withdrawal'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('transactionId');
      expect(res.body.data.amount).toBe('200');
      expect(res.body.data.currency).toBe(CurrencyCode.USD)
    });

    it('should not allow withdrawal with insufficient funds', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdrawal')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          accountNumber: accountNumber,
          amount: 10000,
          currency: CurrencyCode.USD,
          description: 'Test large withdrawal'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Insufficient funds');
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('should get all transactions for the user', async () => {
      const res = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter transactions by type', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?type=DEPOSIT')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].transactionType).toBe('DEPOSIT');
    });
  });

  describe('GET /api/v1/transactions/:id', () => {
    it('should get transaction by ID', async () => {
      // First get the MongoDB _id for the transaction
      const txnRes = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${userToken}`);
      
      const txnId = txnRes.body.data[0].id;
      
      const res = await request(app)
        .get(`/api/v1/transactions/${txnId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(txnId);
    });
  });

  describe('GET /api/v1/transactions/reference/:transactionId', () => {
    it('should get transaction by transaction ID', async () => {
      const res = await request(app)
        .get(`/api/v1/transactions/reference/${transactionId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transactionId).toBe(transactionId);
    });
  });

  describe('GET /api/v1/transactions/stats', () => {
    it('should get transaction statistics for the user', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/stats')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('statsByType');
      expect(res.body.data).toHaveProperty('monthlyTrend');
    });
  });

  describe('GET /api/v1/accounts/:id/transactions', () => {
    it('should get transactions for a specific account', async () => {
      const res = await request(app)
        .get(`/api/v1/accounts/${accountId}/transactions`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });


});





