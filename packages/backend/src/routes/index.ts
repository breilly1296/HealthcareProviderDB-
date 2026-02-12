import { Router } from 'express';
import providersRouter from './providers';
import plansRouter from './plans';
import verifyRouter from './verify';
import locationsRouter from './locations';
import adminRouter from './admin';
import authRouter from './auth';
import savedProvidersRouter from './savedProviders';
import insuranceCardRouter from './insuranceCard';

const router = Router();

router.use('/providers', providersRouter);
router.use('/plans', plansRouter);
router.use('/verify', verifyRouter);
router.use('/locations', locationsRouter);
router.use('/admin', adminRouter);
router.use('/auth', authRouter);
router.use('/saved-providers', savedProvidersRouter);
router.use('/me/insurance-card', insuranceCardRouter);

export default router;
