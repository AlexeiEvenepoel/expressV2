import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'https://expressv2-production.up.railway.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

// app.enableCors({
//   origin: [
//     'http://localhost:4200',
//     'https://panel-ecommerce.netlify.app',
//     'https://www.synerbyteperu.com', // <--- asegúrate que este esté incluido
//     'https://synerbyteperu.com',
//     'https://www.synerbyteperu.com/', // <--- puedes dejar ambos
//   ],
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   credentials: true,
// });
