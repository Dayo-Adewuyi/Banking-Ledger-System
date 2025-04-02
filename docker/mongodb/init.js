db = db.getSiblingDB('banking-ledger');

db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password', 'firstName', 'lastName', 'role', 'status'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string'
        },
        firstName: {
          bsonType: 'string'
        },
        lastName: {
          bsonType: 'string'
        },
        role: {
          enum: ['user', 'admin', 'system']
        },
        status: {
          enum: ['active', 'inactive', 'suspended', 'pending_verification']
        }
      }
    }
  }
});

db.createCollection('accounts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'accountNumber', 'accountType', 'currency', 'isActive'],
      properties: {
        userId: {
          bsonType: 'objectId'
        },
        accountNumber: {
          bsonType: 'string',
          pattern: '^ACCT-\\d{4}-\\d{4}-\\d{4}$'
        },
        accountType: {
          enum: ['CHECKING', 'SAVINGS', 'INVESTMENT', 'CREDIT', 'SYSTEM']
        },
        currency: {
          enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'CNY', 'INR', 'BRL']
        },
        isActive: {
          bsonType: 'bool'
        }
      }
    }
  }
});

db.createCollection('accountBalances', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['accountId', 'currency', 'balance'],
      properties: {
        accountId: {
          bsonType: 'objectId'
        },
        currency: {
          enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'CNY', 'INR', 'BRL']
        },
        balance: {
          bsonType: 'decimal'
        }
      }
    }
  }
});

db.createCollection('transactions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['transactionId', 'transactionType', 'userId', 'entries', 'amount', 'currency', 'status'],
      properties: {
        transactionId: {
          bsonType: 'string'
        },
        transactionType: {
          enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT', 'FEE', 'INTEREST', 'ADJUSTMENT', 'REVERSAL', 'REFUND']
        },
        userId: {
          bsonType: 'objectId'
        },
        entries: {
          bsonType: 'array',
          minItems: 2,
          items: {
            bsonType: 'object',
            required: ['accountId', 'entryType', 'amount'],
            properties: {
              accountId: {
                bsonType: 'objectId'
              },
              entryType: {
                enum: ['DEBIT', 'CREDIT']
              },
              amount: {
                bsonType: 'decimal'
              }
            }
          }
        },
        amount: {
          bsonType: 'decimal'
        },
        currency: {
          enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'CNY', 'INR', 'BRL']
        },
        status: {
          enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED']
        }
      }
    }
  }
});

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "status": 1 });

db.accounts.createIndex({ "userId": 1 });
db.accounts.createIndex({ "accountNumber": 1 }, { unique: true });
db.accounts.createIndex({ "accountType": 1 });
db.accounts.createIndex({ "isActive": 1 });
db.accounts.createIndex({ "userId": 1, "accountType": 1 });
db.accounts.createIndex({ "userId": 1, "currency": 1 });

db.accountBalances.createIndex({ "accountId": 1 }, { unique: true });
db.accountBalances.createIndex({ "currency": 1 });

db.transactions.createIndex({ "transactionId": 1 }, { unique: true });
db.transactions.createIndex({ "userId": 1 });
db.transactions.createIndex({ "transactionType": 1 });
db.transactions.createIndex({ "status": 1 });
db.transactions.createIndex({ "createdAt": -1 });
db.transactions.createIndex({ "userId": 1, "status": 1, "createdAt": -1 });
db.transactions.createIndex({ "entries.accountId": 1 });

db.systemInfo.insertOne({
  _id: "dbInit",
  timestamp: new Date(),
  version: "1.0.0"
});

print("MongoDB initialization completed");