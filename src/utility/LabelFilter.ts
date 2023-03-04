import {ILabels} from '../interface/config';

export enum FilterOperator {
  INCLUDE,
  EXCLUDE,
}

export interface ILabelData {
  label: string;
  operator: FilterOperator;
  values: string[];
}

class LabelFilter {
  constructor(filters: ILabelData[]) {
    this.filters_ = filters;
  }

  isSatisfy(labels: ILabels) {
    return this.filters_.every((filter) => {
      switch (filter.operator) {
        case FilterOperator.INCLUDE:
          return filter.values.includes(labels[filter.label]);
        case FilterOperator.EXCLUDE:
          return !filter.values.includes(labels[filter.label]);
      }
    });
  }

  private filters_: ILabelData[];
}

export {LabelFilter};
