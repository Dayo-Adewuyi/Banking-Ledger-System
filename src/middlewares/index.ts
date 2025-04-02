export * from './auth.middleware';
export * from './validation.middleware';


export default {
    auth: require('./auth.middleware'),
    validation: require('./validation.middleware')
    };