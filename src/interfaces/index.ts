export * from './account.interface'
export * from './accountBalance.interface'
export * from './auth.interface'
export * from './transaction.interface'
export * from './user.interface'

export default {
    ...require('./account.interface').default,
    ...require('./accountBalance.interface').default,
    ...require('./auth.interface').default,
    ...require('./transaction.interface').default,
    ...require('./user.interface').default
}