import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'StoryPinsPaired', async: false })
export class StoryPinsPairedConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments) {
    const dto = args?.object as {
      storyContractId?: string;
      storyVersionId?: string;
    };
    return Boolean(dto?.storyContractId) === Boolean(dto?.storyVersionId);
  }

  defaultMessage() {
    return 'storyContractId and storyVersionId must be supplied together';
  }
}
