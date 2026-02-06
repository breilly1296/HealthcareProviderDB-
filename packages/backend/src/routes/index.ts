import { Router } from 'express';
import providersRouter from './providers';
import plansRouter from './plans';
import verifyRouter from './verify';
import locationsRouter from './locations';
import adminRouter from './admin';

const router = Router();

router.use('/providers', providersRouter);
router.use('/plans', plansRouter);
router.use('/verify', verifyRouter);
router.use('/locations', locationsRouter);
router.use('/admin', adminRouter);

export default router;
