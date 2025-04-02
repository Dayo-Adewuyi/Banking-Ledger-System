# Banking Ledger API

A high-performance, secure, and scalable banking ledger system implementing double-entry accounting with ACID guarantees on MongoDB.

## Technical Architecture

This documentation explains the technical decisions, architectural patterns, and implementation approaches used in this banking ledger system.

## Table of Contents

- [Technology Stack](#technology-stack)
- [Architectural Overview](#architectural-overview)
- [Core Design Principles](#core-design-principles)
- [Programming Paradigms](#programming-paradigms)
- [ACID Compliance and Transactional Integrity](#acid-compliance-and-transactional-integrity)
- [Security Implementation](#security-implementation)
- [Performance Optimizations](#performance-optimizations)
- [Scaling Strategy](#scaling-strategy)
- [Error Handling and Resilience](#error-handling-and-resilience)
- [Project Structure](#project-structure)
- [Development and Deployment](#development-and-deployment)

## Technology Stack

- **Runtime Environment**: Node.js (v18+)
- **Language**: TypeScript (v5+)
- **API Framework**: Express.js 
- **Database**: MongoDB with transactions support
- **Authentication**: JWT-based with enhanced security features
- **Validation**: Express-validator and Joi
- **Testing**: Jest with supertest
- **Documentation**: POSTMAN
- **Containerization**: Docker


## Architectural Overview

The system is designed as a RESTful API that implements domain-driven design principles with clear boundaries between modules. The architecture follows a layered approach:

```
┌─────────────────────────────────────────────────────────┐
│                       API Layer                         │
│  (Routes, Controllers, Middleware, Request Handling)    │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                    Service Layer                        │
│     (Business Logic, Transaction Management)            │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                  Repository Layer                       │
│       (Data Access, MongoDB Transaction Handling)       │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                  Database Layer                         │
│        (MongoDB Connection, Schema Management)          │
└─────────────────────────────────────────────────────────┘
```

### Key Components

1. **API Layer**: Handles HTTP requests, authentication, validation, and response formatting.
2. **Service Layer**: Implements business logic, enforces double-entry accounting rules.
3. **Repository Layer**: Manages data operations with transactional integrity.
4. **Database Layer**: Provides connection management and schema definitions.

## Core Design Principles

### 1. Separation of Concerns

Each module has a specific responsibility and does not overlap with others:

- **Models**: Define data structures and schema validation
- **Services**: Implement business logic and orchestrate operations
- **Controllers**: Handle HTTP requests and delegate to services
- **Middleware**: Process requests before they reach controllers
- **Utils**: Provide reusable helper functions

### 2. Domain-Driven Design

The system is organized around banking domain concepts:

- **Account**: Represents a financial account with its metadata
- **AccountBalance**: Tracks the current balance of an account (separated for performance)
- **Transaction**: Records financial movements with double-entry accounting
- **User**: Manages system users and their permissions

### 3. Immutability

Financial records are treated as immutable:

- Transactions are never deleted or updated once committed
- Balance adjustments create new transaction records
- Historical data is preserved for auditing

## Programming Paradigms

This project uses a **hybrid approach** combining object-oriented and functional programming paradigms, selected to optimize different aspects of the system.

### Object-Oriented Programming (OOP)

OOP is used primarily for:

- **Application Configuration** (`app.ts`): Encapsulates the Express application setup
- **Service Layer**: Implements complex business logic with inheritance and composition
- **Models**: Represents domain entities with properties and behaviors

Key OOP patterns employed:

- **Factory Pattern**: For creating transactions and accounts
- **Strategy Pattern**: For implementing different transaction types
- **Repository Pattern**: For data access abstraction



This pattern provides:

1. Clear sequencing of initialization steps
2. Encapsulation of application configuration
3. Explicit visibility control through private/public methods

### Functional Programming (FP)

Functional programming is used for:

- **Server Lifecycle Management** (`server.ts`): Manages process startup and shutdown
- **Middleware Functions**: Processes HTTP requests through pure transformations
- **Utility Functions**: Implements reusable, stateless operations

Key FP principles applied:

- **Pure Functions**: Side-effect free operations for predictable behavior
- **Function Composition**: Building complex operations from simple functions
- **Immutability**: Preventing mutation of shared state


This approach provides:

1. Clear procedural flow for the server lifecycle
2. Explicit error handling boundaries
3. Composable functions for server operations

### Why This Hybrid Approach?

The hybrid approach was chosen deliberately based on the strengths of each paradigm:

1. **OOP Strengths Leveraged**:
   - Encapsulation of state (critical for request processing)
   - Polymorphism for transaction handling
   - Interface contracts for clear boundaries

2. **FP Strengths Leveraged**:
   - Predictable data transformations
   - Reduced side effects in critical paths
   - Simplified testing through pure functions

This hybrid strategy recognizes that different parts of a banking system have different characteristics:

- The application configuration is inherently stateful (OOP)
- Server initialization is procedural and transformational (FP)
- Business logic often combines stateful and stateless operations (hybrid)

## ACID Compliance and Transactional Integrity

### Double-Entry Accounting

The system implements double-entry accounting principles:

1. Every financial transaction affects at least two accounts
2. The sum of debits must equal the sum of credits
3. Every transaction is validated for balance before commitment

Example transaction flow:

```
┌─────────────┐         ┌─────────────┐
│  Account A  │         │  Account B  │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │  Debit (-$100)        │ Credit (+$100)
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│  Balance    │         │  Balance    │
│  Updated    │         │  Updated    │
└─────────────┘         └─────────────┘
       │                       │
       └───────────┬───────────┘
                   │
         ┌─────────▼─────────┐
         │    Transaction    │
         │    Record with    │
         │  Balanced Entries │
         └───────────────────┘
```

### MongoDB Transactions

MongoDB transactions are used to ensure ACID properties:

```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Update account balances
  // Create transaction record
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### Optimistic Concurrency Control

The system uses optimistic concurrency control to prevent race conditions:

1. Each account has a `version` field
2. Operations check the version before applying updates
3. If the version changed, the operation is retried

## Security Implementation

### Authentication and Authorization

1. **JWT-Based Authentication**:
   - Short-lived access tokens (1 hour)
   - Refresh token rotation
   - Secure token storage practices

2. **Role-Based Access Control**:
   - Granular permission system
   - Principle of least privilege
   - Resource-based authorization

### Request Validation

Multiple layers of validation:

1. **Schema Validation**: Using Joi for request payload validation
2. **Business Rule Validation**: In service layer
3. **Database Constraints**: In MongoDB schema

### Security Middleware

A comprehensive security middleware stack:

- **Helmet**: For secure HTTP headers
- **CORS**: With restrictive configuration
- **Rate Limiting**: Tiered approach for different endpoints
- **Input Sanitization**: Preventing injection attacks
- **XSS Protection**: Sanitizing input and output
- **HTTP Parameter Pollution Protection**: Preventing parameter exploits

## Performance Optimizations

### Database Design

1. **Separate Balance Collection**:
   - Improves concurrency by separating account metadata from balances
   - Reduces document size for common queries

2. **Strategic Indexing**:
   - Compound indexes for common query patterns
   - Text indexes for search functionality
   - TTL indexes for temporary data

### Query Optimization

1. **Projection**: Only retrieving needed fields
2. **Pagination**: All list endpoints support pagination
3. **Lean Queries**: Using `.lean()` for read-heavy operations

### Caching Strategy

1. **Memory Caching**: For frequently accessed reference data
2. **Conditional Response Caching**: Using ETags
3. **Query Result Caching**: For expensive read operations

### Processing Efficiency

1. **Clustering**: Using Node.js cluster module for multi-core utilization
2. **Connection Pooling**: Optimized database connection management
3. **Stream Processing**: For large data exports

## Scaling Strategy

### Horizontal Scaling

The application is designed for horizontal scaling:

1. **Stateless Design**: No session state in the application
2. **Load Balancing Ready**: Works behind load balancers
3. **Independent Services**: Can be deployed as microservices

### Vertical Scaling

Optimized for efficient resource usage:

1. **Memory Management**: Careful attention to closures and object lifecycles
2. **CPU Optimization**: Batching and async processing for CPU-intensive tasks
3. **I/O Efficiency**: Asynchronous operations for all I/O bound tasks

## Error Handling and Resilience

### Comprehensive Error Hierarchy

Custom error classes with specific codes and HTTP status mappings:

```typescript
class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: any;
}

class InsufficientFundsError extends ApiError {
  constructor(message: string = 'Insufficient funds', details?: any) {
    super(400, message, details, 'ERR_INSUFFICIENT_FUNDS');
  }
}
```

### Circuit Breaking

Implementation of circuit breaking for external services:

1. **Failure Detection**: Tracking error rates
2. **Graceful Degradation**: Fallback strategies
3. **Self-Healing**: Automatic recovery

### Logging and Monitoring

Multi-level logging strategy:

1. **Request Logging**: Detailed logs for all API requests
2. **Error Logging**: Comprehensive error details
3. **Audit Logging**: Immutable logs for financial operations
4. **Performance Metrics**: Tracking system health

## Project Structure

```

├── src/
│   ├── config/                   # Configuration files
│   ├── models/                   # MongoDB schemas and models
│   ├── interfaces/               # TypeScript interfaces
│   ├── services/                 # Business logic
│   ├── controllers/              # Request handlers
│   ├── routes/                   # API routes
│   ├── middleware/               # Express middleware
│   ├── utils/                    # Utility functions
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # Server initialization
├── tests/                        # Test files
├── docker/                       # Docker configuration
                        
```

## Development and Deployment

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

### Containerization

Docker setup for consistent deployment:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

