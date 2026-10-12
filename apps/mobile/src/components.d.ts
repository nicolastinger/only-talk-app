import UserTypeTag from "@/components/UserTypeTag.vue";

declare module "vue" {
  export interface GlobalComponents {
    UserTypeTag: typeof UserTypeTag;
  }
}

export {};
