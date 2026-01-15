declare module "bad-words" {
  type FilterOptions = {
    placeHolder?: string;
    regex?: RegExp;
    replaceRegex?: RegExp;
    splitRegex?: RegExp;
    emptyList?: boolean;
    list?: string[];
    exclude?: string[];
  };

  class Filter {
    constructor(options?: FilterOptions);
    addWords(...words: string[]): void;
    removeWords(...words: string[]): void;
    clean(text: string): string;
    isProfane(text: string): boolean;
  }

  export default Filter;
}
