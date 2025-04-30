import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class PhotoGalleryAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "photo-gallery-images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imageTable = new dynamodb.Table(this, "ImageTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const photoGalleryTopic = new sns.Topic(this, "PhotoGalleryTopic", {
      displayName: "Photo Gallery Topic",
    });

    const deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const logImageQueue = new sqs.Queue(this, "LogImageQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    const addMetadataQueue = new sqs.Queue(this, "AddMetadataQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    const updateStatusQueue = new sqs.Queue(this, "UpdateStatusQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    photoGalleryTopic.addSubscription(
      new subs.SqsSubscription(logImageQueue, {
        filterPolicy: {
          eventName: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ObjectCreated:*"],
          }),
        },
      })
    );

    photoGalleryTopic.addSubscription(
      new subs.SqsSubscription(addMetadataQueue, {
        filterPolicy: {
          metadata_type: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption", "Date", "Name"],
          }),
        },
      })
    );

    photoGalleryTopic.addSubscription(
      new subs.SqsSubscription(updateStatusQueue, {
        filterPolicy: {
          statusUpdate: sns.SubscriptionFilter.stringFilter({
            allowlist: ["true"],
          }),
        },
      })
    );

    const logImageFn = new lambdanode.NodejsFunction(this, "LogImageFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/logImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        TABLE_NAME: imageTable.tableName,
      },
    });

    const removeImageFn = new lambdanode.NodejsFunction(
      this,
      "RemoveImageFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/removeImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        environment: {
          BUCKET_NAME: imagesBucket.bucketName,
        },
      }
    );

    const addMetadataFn = new lambdanode.NodejsFunction(
      this,
      "AddMetadataFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/addMetadata.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    const updateStatusFn = new lambdanode.NodejsFunction(
      this,
      "UpdateStatusFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/updateStatus.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(photoGalleryTopic)
    );

    logImageFn.addEventSource(
      new events.SqsEventSource(logImageQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    removeImageFn.addEventSource(
      new events.SqsEventSource(deadLetterQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    addMetadataFn.addEventSource(
      new events.SqsEventSource(addMetadataQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    updateStatusFn.addEventSource(
      new events.SqsEventSource(updateStatusQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    imagesBucket.grantRead(logImageFn);
    imagesBucket.grantReadWrite(removeImageFn);
    
    imageTable.grantReadWriteData(logImageFn);
    imageTable.grantReadWriteData(addMetadataFn);
    imageTable.grantReadWriteData(updateStatusFn);

    new cdk.CfnOutput(this, "ImagesBucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "SNSTopicArn", {
      value: photoGalleryTopic.topicArn,
    });

    new cdk.CfnOutput(this, "ImageTableName", {
      value: imageTable.tableName,
    });
  }
}