import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EtudiantAuthController } from './etudiant-auth.controller';
import { EtudiantAuthService } from './etudiant-auth.service';
import { JwtEtudiantStrategy } from './jwt-etudiant.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PassportModule.register({}),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'JWT_SECRET_ETUDIANT',
          'secret_jwt_etudiant_dev',
        ),
        signOptions: { expiresIn: '8h' },
      }),
    }),
    PrismaModule,
  ],
  controllers: [EtudiantAuthController],
  providers: [EtudiantAuthService, JwtEtudiantStrategy],
  exports: [EtudiantAuthService],
})
export class EtudiantAuthModule {}
