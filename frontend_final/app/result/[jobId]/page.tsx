import { redirect } from "next/navigation";

type ResultAliasPageProps = {
  params: {
    jobId: string;
  };
};

export default function ResultAliasPage({ params }: ResultAliasPageProps) {
  redirect(`/results/${params.jobId}`);
}
