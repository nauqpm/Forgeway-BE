import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { RequirementsModule } from '../requirements/requirements.module';
import { RequirementsService } from '../requirements/requirements.service';
import { StoryImpactService } from './services/story-impact.service';
import { StoryContractsController } from './story-contracts.controller';
import { StoryContractsModule } from './story-contracts.module';
import { StoryTaskImpactController } from './story-task-impact.controller';

describe('Story Governance module assembly', () => {
  it('registers both Story REST controllers and exports task impact integration', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StoryContractsModule),
    ).toEqual([StoryContractsController, StoryTaskImpactController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, StoryContractsModule),
    ).toContain(StoryImpactService);
  });

  it('exports the requirements service consumed by Story drafts', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, RequirementsModule),
    ).toContain(RequirementsService);
  });
});
