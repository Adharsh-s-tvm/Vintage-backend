import cron from 'node-cron';
import Coupon from '../models/product/couponModel.js';

export const initCouponExpirationCheck = async () => {
  cron.schedule('0 0 * * *', async () => {  
    try {   
        const currentDate = new Date()
        
        await Coupon.updateMany(
          {
            endDate: { $lt: currentDate },
            isExpired: false,
          },
          {
            $set: {
              isExpired: true,
            },
          }
        );

        console.log('Coupon expiration check completed.');
      } catch (error) {
        console.error('Error checking coupon expiration:', error);
      }
    });

}