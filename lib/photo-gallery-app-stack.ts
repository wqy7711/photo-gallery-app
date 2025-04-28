import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';

export class PhotoGalleryAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const photoBucket = new s3.Bucket(this, 'PhotoBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });
    
    const imageTable = new dynamodb.Table(this, 'ImageTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    
    const imageTopic = new sns.Topic(this, 'ImageTopic', {
      displayName: 'Image Events Topic'
    });
    
    const imageDeadLetterQueue = new sqs.Queue(this, 'ImageDeadLetterQueue', {
      queueName: 'ImageDeadLetterQueue',
      retentionPeriod: cdk.Duration.days(14)
    });
    
    const imageUploadQueue = new sqs.Queue(this, 'ImageUploadQueue', {
      queueName: 'ImageUploadQueue',
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: {
        queue: imageDeadLetterQueue,
        maxReceiveCount: 3
      }
    });
  }
}