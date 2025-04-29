#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PhotoGalleryAppStack } from "../lib/photo-gallery-app-stack";

const app = new cdk.App();
new PhotoGalleryAppStack(app, "PhotoGalleryStack", {
  env: { region: "eu-west-1" },
});