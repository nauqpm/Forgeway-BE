import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
  ValidateIf,
  ValidateBy,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStoryContractDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(255)
  @Transform(trim)
  title!: string;

  @IsMongoId()
  primaryRequirementId!: string;
}

export class CreateStoryDraftDto {}

export class StoryRequirementLinkInputDto {
  @IsMongoId()
  requirementId!: string;

  @IsIn(['PRIMARY', 'SUPPORTING', 'CONSTRAINT', 'CONFLICT'])
  role!: 'PRIMARY' | 'SUPPORTING' | 'CONSTRAINT' | 'CONFLICT';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Transform(trim)
  evidenceNote?: string;
}

export class UpdateStoryDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedDraftRevision!: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateBy({
    name: 'maxJsonLength',
    constraints: [100_000],
    validator: {
      validate: (value, args) =>
        JSON.stringify(value).length <= Number(args?.constraints[0]),
    },
  })
  content?: Record<string, unknown>;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique(link => link.requirementId)
  @ValidateNested({ each: true })
  @Type(() => StoryRequirementLinkInputDto)
  requirementLinks?: StoryRequirementLinkInputDto[];

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptanceCriterionInputDto)
  criterionInputs?: AcceptanceCriterionInputDto[];

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsMongoId({ each: true })
  decisionProposalIds?: string[];
}

export class AcceptanceCriterionInputDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @Transform(trim)
  key!: string;

  @IsIn(['MUST', 'SHOULD', 'COULD'])
  priority!: 'MUST' | 'SHOULD' | 'COULD';

  @IsString()
  @Matches(/\S/)
  @MaxLength(10_000)
  @Transform(trim)
  statement!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  given?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  when?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  then?: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  @Transform(trim)
  verificationMethod!: string;
}

export class DecisionOptionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(500)
  @Transform(trim)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(10_000)
  @Transform(trim)
  label!: string;
}

export class CreateDecisionProposalDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  @Transform(trim)
  question!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((option: DecisionOptionDto) => option.key)
  @ValidateNested({ each: true })
  @Type(() => DecisionOptionDto)
  options!: DecisionOptionDto[];

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(10_000)
  @Transform(trim)
  recommendation?: string;
}

export class UpdateDecisionProposalDto extends CreateDecisionProposalDto {}

export class DecisionResolutionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(100)
  @Transform(trim)
  selectedOption!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2_000)
  @Transform(trim)
  rationale!: string;
}

export class ApproveStoryVersionDto {
  @IsMongoId()
  approvalRequestId!: string;

  @ValidateIf((_, value) => value !== null)
  @IsMongoId()
  expectedCurrentVersionId!: string | null;
}

export class RejectStoryVersionDto {
  @IsMongoId()
  approvalRequestId!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  @Transform(trim)
  reason?: string;
}

export class CreateCriterionVerificationDto {
  @IsMongoId()
  storyVersionId!: string;

  @IsIn(['PASSED', 'FAILED', 'INCONCLUSIVE'])
  status!: 'PASSED' | 'FAILED' | 'INCONCLUSIVE';

  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  @Transform(trim)
  evidenceType!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(2_000)
  @Transform(trim)
  evidenceRef!: string;

  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  @Transform(trim)
  pullRequestRef?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  @Transform(trim)
  qaRunRef?: string;
}
